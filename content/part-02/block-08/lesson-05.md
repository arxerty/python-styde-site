# Логирование (logging) вместо print

## Чем плох print

Пока программа запускается у вас в терминале, `print` — отличный инструмент отладки. Но вот ваш сервис с LLM работает на сервере, и пользователь пишет: «вчера в 15:40 бот ответил ерундой». Что вы узнаете из `print`?

- **Ничего не сохранилось**: вывод ушёл в терминал, которого нет, или потерялся при перезапуске.
- **Нет контекста**: когда это было, в каком модуле, к какому запросу относится строка «ошибка разбора».
- **Нельзя управлять подробностью**: при отладке нужны все детали (промпт, сырые ответы), в обычной работе — только важное. С `print` приходится комментировать и раскомментировать строки.
- **Всё смешано**: служебные сообщения перемешаны с полезным выводом программы — CLI-утилита, печатающая JSON, ломает его своими отладочными строками.

Модуль `logging` из стандартной библиотеки решает всё это. Сообщение записывается **один раз** в коде, а куда, в каком формате и какие именно сообщения попадут — решает конфигурация, которую можно менять без правки кода.

## Уровни важности

Каждое сообщение имеет **уровень**:

| Уровень | Число | Когда использовать |
|---|---|---|
| `DEBUG` | 10 | подробности для отладки: промпт, сырые ответы, промежуточные значения |
| `INFO` | 20 | штатные события: запрос выполнен, файл загружен, сервис запущен |
| `WARNING` | 30 | что-то необычное, но работа продолжается: повтор запроса, устаревший параметр |
| `ERROR` | 40 | операция не удалась: запрос упал после всех повторов |
| `CRITICAL` | 50 | всё плохо, программа не может продолжать |

Логгер пропускает сообщения **не ниже** заданного уровня. По умолчанию это `WARNING`:

```python
import logging

logging.basicConfig(format="%(levelname)s:%(name)s:%(message)s", force=True)
logging.debug("не видно")
logging.info("тоже не видно")
logging.warning("повтор запроса: 429")
logging.error("запрос не удался")
```

```text
WARNING:root:повтор запроса: 429
ERROR:root:запрос не удался
```

`basicConfig` — быстрая настройка: формат, уровень, куда писать. Параметр `force=True` сбрасывает прежнюю настройку — удобно в ноутбуках и примерах, которые запускаются много раз. Сменить уровень — одна строка:

```python
import logging

logging.basicConfig(level=logging.DEBUG, format="%(levelname)-8s %(message)s", force=True)
logging.debug("промпт: %r", "Привет")
logging.info("ответ получен за %.2f с", 0.4321)
```

```text
DEBUG    промпт: 'Привет'
INFO     ответ получен за 0.43 с
```

## Логгеры с именами: getLogger(__name__)

Функции `logging.info(...)` пишут в **корневой** логгер (root). В настоящем коде так не делают: в каждом модуле создают свой логгер с именем модуля:

```python norun
# fxcli/client.py
import logging

logger = logging.getLogger(__name__)     # имя "fxcli.client"


def fetch(path):
    logger.debug("GET %s", path)
    ...
```

Имя попадает в каждую запись — сразу видно, откуда сообщение. А главное, логгеры образуют **иерархию** по точкам в имени: `fxcli.client` — потомок `fxcli`, тот — потомок корневого. Сообщение передаётся вверх по иерархии (это называется **propagation**), поэтому настройки можно задать на любом уровне:

```python
import logging
import sys

logging.basicConfig(stream=sys.stdout, level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s", force=True)
logging.getLogger("fxcli").setLevel(logging.DEBUG)     # свой пакет — подробно

logging.getLogger("fxcli.client").debug("GET /latest")
logging.getLogger("httpx").info("HTTP Request: GET ...")   # чужая библиотека — только WARNING+
logging.getLogger("httpx").warning("медленный ответ")
```

```text
DEBUG fxcli.client: GET /latest
WARNING httpx: медленный ответ
```

Так обычно и настраивают приложения: свой код — подробно, шумные библиотеки (`httpx`, `urllib3`, `openai`) — только предупреждения и ошибки.

## Как устроен logging: логгеры, обработчики, форматтеры

Внутри `logging` четыре вида объектов:

- **Logger** — точка входа: `logger.info(...)`. Решает, пропустить ли сообщение по уровню, и создаёт запись `LogRecord` (время, уровень, имя логгера, модуль, строка, текст).
- **Handler** — куда отправить запись: `StreamHandler` (консоль), `FileHandler` (файл), `RotatingFileHandler` (файл с ротацией по размеру), обработчики для syslog, HTTP и т. д. У обработчика тоже есть свой уровень.
- **Formatter** — как превратить запись в строку.
- **Filter** — дополнительный отбор или изменение записей.

`basicConfig` просто создаёт обработчик и форматтер для корневого логгера. Можно собрать то же самое вручную — например, чтобы писать в консоль кратко, а в файл подробно:

```python norun
import logging

logger = logging.getLogger("fxcli")
logger.setLevel(logging.DEBUG)

console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))

file_handler = logging.FileHandler("fxcli.log", encoding="utf-8")
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s:%(lineno)d %(message)s"))

logger.addHandler(console)
logger.addHandler(file_handler)
```

Полезные поля формата:

| Поле | Что подставляется |
|---|---|
| `%(asctime)s` | время записи |
| `%(levelname)s` | уровень: `INFO`, `ERROR` |
| `%(name)s` | имя логгера |
| `%(message)s` | текст сообщения |
| `%(module)s`, `%(funcName)s`, `%(lineno)d` | файл, функция и строка вызова |
| `%(process)d`, `%(threadName)s` | процесс и поток |

Типичная ловушка — **дублирование**: если функция настройки добавляет обработчик при каждом вызове, после трёх вызовов каждая строка печатается трижды. Логгеры — глобальные объекты: `getLogger("fxcli")` всегда возвращает один и тот же логгер.

```python
import logging
import sys


def setup():
    logger = logging.getLogger("demo.dup")
    logger.handlers.clear()            # без этой строки обработчики накапливаются
    logger.addHandler(logging.StreamHandler(sys.stdout))
    logger.propagate = False           # не передавать записи корневому логгеру
    return logger


setup()
logger = setup()
logger.warning("одна строка, а не две")
print(len(logger.handlers), logging.getLogger("demo.dup") is logger)
```

```text
одна строка, а не две
1 True
```

## Ленивое форматирование и исключения

Обратите внимание: в примерах аргументы передаются **отдельно** — `logger.debug("GET %s", path)`, а не f-строкой. Причина: строка собирается, только если сообщение действительно будет выведено. Если уровень `DEBUG` выключен, `logger.debug(f"ответ: {huge_response}")` всё равно потратит время на форматирование огромного ответа, а `logger.debug("ответ: %s", huge_response)` — нет. Кроме того, системы сбора логов группируют сообщения по шаблону `"ответ: %s"`.

Для ошибок есть `logger.exception(...)` — пишет на уровне `ERROR` и добавляет полный traceback текущего исключения. Вызывайте его внутри `except`:

```python
import logging
import sys

logging.basicConfig(stream=sys.stdout, format="%(levelname)s %(message)s", force=True)
logger = logging.getLogger("parser")


def parse_answer(text):
    try:
        return int(text)
    except ValueError:
        logger.exception("не удалось разобрать ответ модели: %r", text)
        return None


print(parse_answer("сорок два"))
```

```text
ERROR не удалось разобрать ответ модели: 'сорок два'
Traceback (most recent call last):
  File "<main.py>", line 10, in parse_answer
ValueError: invalid literal for int() with base 10: 'сорок два'
None
```

Traceback в логе — это то, что спасает при разборе ночного сбоя: видно и место, и тип ошибки, и данные.

## Дополнительные поля: extra

Часто к сообщению нужно приложить контекст: идентификатор запроса, пользователя, модель. Параметр `extra` добавляет поля в запись, и их можно вывести в формате:

```python
import logging
import sys

logging.basicConfig(stream=sys.stdout, format="%(levelname)s [%(request_id)s] %(message)s", force=True)
logger = logging.getLogger("api")
logger.warning("модель ответила за %.1f с", 12.3, extra={"request_id": "req-42"})
```

```text
WARNING [req-42] модель ответила за 12.3 с
```

В продакшене такие поля обычно пишут в **структурированном** виде — каждая запись строкой JSON. Системы сбора логов (ELK, Loki, Datadog) умеют искать по полям: «все ERROR для модели large за последний час». Для этого пишут свой `Formatter`, который превращает запись в JSON, или используют библиотеки `structlog`, `python-json-logger`.

## Фильтры: например, маскировка секретов

Фильтр — объект с методом `filter(record)`: вернул `False` — запись отбрасывается; заодно он может изменить запись. Классический пример для AI-приложений — **не допустить API-ключ в логи**:

```python
import logging
import re
import sys


class MaskSecrets(logging.Filter):
    def filter(self, record):
        record.msg = re.sub(r"sk-[A-Za-z0-9]{8,}", "sk-***", record.getMessage())
        record.args = ()
        return True


logger = logging.getLogger("secure")
logger.handlers.clear()
handler = logging.StreamHandler(sys.stdout)
handler.addFilter(MaskSecrets())
logger.addHandler(handler)
logger.propagate = False
logger.warning("ключ %s отклонён", "sk-abcdef1234567890")
```

```text
ключ sk-*** отклонён
```

`record.getMessage()` подставляет аргументы в шаблон; после этого мы заменяем шаблон готовым замаскированным текстом и очищаем аргументы.

## Конфигурация: где настраивать логирование

Правило простое: **библиотеки только пишут, приложение настраивает**.

- В модулях пакета — только `logger = logging.getLogger(__name__)` и вызовы `logger.info(...)`. Никаких `basicConfig` и обработчиков: библиотека не должна решать за приложение, куда и как выводить.
- В точке входа приложения (функция `main`, запуск сервиса) — один раз настроить: уровень (часто из переменной окружения или ключа `-v`), формат, обработчики.

Для сложных конфигураций есть `logging.config.dictConfig` — вся настройка словарём, который можно хранить в YAML или TOML:

```python norun
import logging.config

logging.config.dictConfig({
    "version": 1,
    "formatters": {"short": {"format": "%(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "short"}},
    "loggers": {"httpx": {"level": "WARNING"}},
    "root": {"level": "INFO", "handlers": ["console"]},
})
```

Логи по умолчанию идут в **stderr**, а полезный вывод программы — в stdout. Поэтому `fxcli rates USD > rates.json` сохранит в файл только данные, а сообщения логов останутся в терминале.

## Логи в тестах: caplog

pytest перехватывает записи логов фикстурой `caplog` — можно проверить, что код предупредил о повторе или записал ошибку:

```python norun
import logging


def test_retry_is_logged(caplog):
    caplog.set_level(logging.WARNING, logger="fxcli")
    fetch_with_retry(...)                      # внутри logger.warning("повтор %d", attempt)
    assert "повтор 1" in caplog.text
    assert caplog.records[0].levelname == "WARNING"
```

`caplog.records` — список записей `LogRecord`, `caplog.messages` — список готовых текстов, `caplog.text` — всё одной строкой.

## Разбор задачи: переводим скрипт с print на logging

Было:

```python norun
def process(paths):
    print("начинаю обработку", len(paths), "файлов")
    for path in paths:
        try:
            data = load(path)
            print("загружен", path)
        except FileNotFoundError:
            print("ОШИБКА: нет файла", path)
    print("готово")
```

Стало:

```python norun
import logging

logger = logging.getLogger(__name__)


def process(paths):
    logger.info("начинаю обработку %d файлов", len(paths))
    loaded = 0
    for path in paths:
        try:
            data = load(path)
        except FileNotFoundError:
            logger.error("нет файла: %s", path)
            continue
        logger.debug("загружен %s (%d записей)", path, len(data))
        loaded += 1
    logger.info("готово: загружено %d из %d", loaded, len(paths))
    return loaded


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    process(["a.json", "b.json"])
```

Каждому сообщению выбран уровень по смыслу: детали загрузки — `DEBUG`, начало и итог — `INFO`, отсутствующий файл — `ERROR`. Модуль ничего не настраивает — настройка в блоке запуска. Функция вернула результат вместо печати, поэтому её легко тестировать.

## Попробуйте сами

1. Настройте `basicConfig` с форматом `"%(asctime)s %(funcName)s:%(lineno)d %(message)s"` и вызовите логгер из двух функций.
2. Сделайте так, чтобы `DEBUG` от своего пакета писался в файл, а в консоль шли только `WARNING` и выше.
3. Вызовите `logger.exception` вне блока `except`. Что окажется в логе?

## Частые ошибки

- **f-строки в вызовах логгера.** `logger.debug(f"... {data}")` форматирует строку даже при выключенном DEBUG; пишите `logger.debug("... %s", data)`.
- **`basicConfig` в библиотечном модуле.** Модуль при импорте перенастраивает логирование всего приложения. Настройка — только в точке входа.
- **Повторное добавление обработчиков.** Каждая строка печатается несколько раз. Проверяйте `logger.handlers` или настраивайте один раз.
- **`logging.info(...)` вместо именованного логгера.** Все сообщения приходят от `root`, и их нельзя настроить по модулям.
- **`logger.error(str(e))` вместо `logger.exception(...)`.** Теряется traceback — самое ценное для разбора.
- **Секреты и персональные данные в логах.** API-ключи, токены, тексты пользователей попадают в файлы и системы сбора логов, к которым доступ есть у многих. Маскируйте, а промпты с личными данными пишите только на уровне DEBUG и только там, где это разрешено.
- **Всё на уровне INFO.** Лог из миллиона одинаково важных строк бесполезен. Уровень — это смысл сообщения.

## Где это в AI-инженерии

- **Отладка промптов**: на уровне DEBUG пишут итоговый промпт, параметры и сырой ответ модели — без этого невозможно понять, почему модель ответила странно.
- **Стоимость и производительность**: на каждый запрос к LLM — запись INFO с моделью, числом токенов, стоимостью и временем ответа; из таких записей строят дашборды расходов.
- **Повторы и сбои провайдера**: WARNING на каждый повтор после 429/503 и ERROR после исчерпания попыток показывают, когда провайдер нестабилен.
- **Трассировка запросов**: `request_id` в `extra` связывает все записи одного запроса пользователя — поиск в RAG, вызовы инструментов агента, ответ модели. На этом построены LLM-observability инструменты (LangSmith, Langfuse).
- **Безопасность**: фильтры маскируют ключи и персональные данные до того, как запись покинет процесс.

## Итоги урока

- `logging` вместо `print`: сообщения с уровнем, временем и источником, которые можно включать, отключать и направлять куда нужно без правки кода.
- Уровни: DEBUG < INFO < WARNING < ERROR < CRITICAL; логгер пропускает сообщения не ниже своего уровня.
- В каждом модуле — `logger = logging.getLogger(__name__)`; логгеры образуют иерархию, записи передаются вверх к корневому.
- Logger создаёт запись, Handler решает куда, Formatter — как, Filter — что пропустить или изменить.
- Аргументы — отдельно (`"%s", value`), ошибки — через `logger.exception`; настройка — один раз в точке входа; в тестах логи проверяют через `caplog`.
