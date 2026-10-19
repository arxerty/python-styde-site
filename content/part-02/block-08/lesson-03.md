# Моки (unittest.mock): тестирование кода с внешними API

## Почему нельзя просто вызвать настоящий API

Код AI-приложения почти всегда разговаривает с внешним миром: отправляет запросы к LLM, ходит за курсами валют, пишет в базу, читает время и случайные числа. Если тест вызывает всё это по-настоящему, он:

- **медленный** — один запрос к модели идёт секунды, а тестов сотни;
- **дорогой** — каждый прогон тратит токены и деньги;
- **нестабильный** — сеть пропала, сервис ответил 503, модель сформулировала ответ иначе, и тест упал без изменений в коде;
- **не может проверить ошибки** — как вызвать таймаут или ответ 429 по заказу?
- **опасный** — тест функции «отправить письмо» отправит письмо.

Решение — подменить внешнюю зависимость **двойником** (test double): объектом, который выглядит как настоящий, но ведёт себя так, как нужно тесту, и запоминает, как его вызывали. В Python для этого есть стандартный модуль `unittest.mock`.

Двойников обычно делят на виды:

- **стаб (stub)** — возвращает заготовленные ответы: «на любой запрос верни `{"rate": 92.5}`»;
- **мок (mock)** — ещё и записывает вызовы, чтобы тест проверил: «функция отправки вызвана ровно один раз с таким текстом»;
- **фейк (fake)** — упрощённая рабочая реализация: словарь вместо базы данных, `httpx.MockTransport` вместо сервера из блока 2.7.

`unittest.mock.Mock` умеет быть и стабом, и моком.

## Mock: объект, который умеет всё

```python
from unittest.mock import Mock

client = Mock()
client.complete.return_value = "Привет! Чем помочь?"

answer = client.complete("Привет", temperature=0)
print(answer)
print(client.complete.call_count)
print(client.complete.call_args)
client.complete.assert_called_once_with("Привет", temperature=0)
```

```text
Привет! Чем помочь?
1
call('Привет', temperature=0)
```

Что здесь происходит:

- обращение к любому атрибуту мока (`client.complete`) создаёт **дочерний мок** — поэтому мок подходит на место почти любого объекта;
- вызов мока возвращает `return_value` (по умолчанию — ещё один мок);
- мок запоминает каждый вызов: `call_count` — сколько раз, `call_args` — аргументы последнего вызова, `call_args_list` — всех вызовов.

Методы проверки бросают `AssertionError`, если ожидание не выполнено:

| Метод | Проверяет |
|---|---|
| `assert_called()` | вызывался хотя бы раз |
| `assert_called_once()` | ровно один раз |
| `assert_called_with(*args, **kwargs)` | аргументы **последнего** вызова |
| `assert_called_once_with(...)` | ровно один вызов с такими аргументами |
| `assert_any_call(...)` | был хотя бы один такой вызов |
| `assert_not_called()` | не вызывался ни разу |

Для проверки нескольких вызовов сравнивают `call_args_list` со списком объектов `call`:

```python
from unittest.mock import Mock, call

sleep = Mock()
for delay in [0.5, 1.0, 2.0]:
    sleep(delay)
print(sleep.call_args_list == [call(0.5), call(1.0), call(2.0)])
print(sleep.call_args_list[1].args)
```

```text
True
(1.0,)
```

## side_effect: ошибки, последовательности, логика

`return_value` возвращает одно и то же. Для сложного поведения есть `side_effect`:

- **исключение** (класс или объект) — мок бросает его при вызове;
- **итерируемый объект** — каждый вызов возвращает следующий элемент; если элемент — исключение, оно бросается;
- **функция** — вызывается с теми же аргументами, её результат становится результатом мока.

```python
from unittest.mock import Mock

api = Mock()
api.get.side_effect = [ConnectionError("нет сети"), TimeoutError(), {"status": "ok"}]

for attempt in range(3):
    try:
        print(attempt, api.get("/health"))
    except (ConnectionError, TimeoutError) as error:
        print(attempt, "ошибка:", type(error).__name__)

prices = Mock(side_effect=lambda model: {"mini": 0.15, "large": 2.5}[model])
print(prices("large"))
```

```text
0 ошибка: ConnectionError
1 ошибка: TimeoutError
2 {'status': 'ok'}
2.5
```

Последовательность из `side_effect` — главный инструмент для тестирования **повторов**: «первые два запроса падают, третий успешен».

## Внедрение зависимостей: проще всего мокать то, что передали

Посмотрите на две версии одной функции:

```python norun
# Трудно тестировать: клиент создаётся внутри
def summarize(text):
    client = LLMClient(api_key=os.environ["LLM_API_KEY"])
    return client.complete(f"Кратко перескажи: {text}")


# Легко тестировать: клиент передаётся параметром
def summarize(text, client):
    return client.complete(f"Кратко перескажи: {text}")
```

Вторую версию тест вызывает с моком — никаких хитростей:

```python
from unittest.mock import Mock


def summarize(text, client):
    return client.complete(f"Кратко перескажи: {text}").strip()


def test_summarize_builds_prompt_and_strips():
    client = Mock()
    client.complete.return_value = "  Кот спит.  "
    assert summarize("Длинная история про кота", client) == "Кот спит."
    client.complete.assert_called_once_with("Кратко перескажи: Длинная история про кота")


test_summarize_builds_prompt_and_strips()
print("ok")
```

```text
ok
```

Этот приём — **внедрение зависимостей** — вы уже видели в блоке 2.7: функции получали `httpx.AsyncClient` параметром, а тесты передавали клиент с `MockTransport`. Так же стоит передавать функцию `sleep` (чтобы тест повторов не ждал по-настоящему), источник времени и генератор случайных чисел.

## patch: подмена там, где нельзя передать

Не всегда код можно переписать. Если функция сама вызывает `httpx.get` или `time.sleep`, используют `unittest.mock.patch` — он временно заменяет атрибут модуля моком и возвращает оригинал после теста:

```python norun
# weather.py
import httpx


def current_temperature(city):
    response = httpx.get("https://api.weather.example/v1/current", params={"city": city}, timeout=5)
    response.raise_for_status()
    return response.json()["temp"]
```

```python norun
# test_weather.py
from unittest.mock import Mock, patch

import weather


def test_current_temperature():
    fake_response = Mock()
    fake_response.json.return_value = {"temp": 21.5}
    with patch("weather.httpx.get", return_value=fake_response) as fake_get:
        assert weather.current_temperature("Казань") == 21.5
    fake_get.assert_called_once()
    assert fake_get.call_args.kwargs["params"] == {"city": "Казань"}
```

`patch` работает как контекстный менеджер (`with`) или как декоратор теста — тогда мок приходит дополнительным аргументом:

```python norun
@patch("weather.httpx.get")
def test_http_error(fake_get):
    fake_get.return_value.raise_for_status.side_effect = httpx.HTTPStatusError(
        "404", request=Mock(), response=Mock()
    )
    with pytest.raises(httpx.HTTPStatusError):
        weather.current_temperature("Нигде")
```

Есть и `patch.object(объект, "атрибут", ...)` — когда под рукой сам объект, а не строка с путём.

## Главное правило patch: подменяйте там, где ищут

Строка в `patch` — это путь к имени **в том модуле, где оно используется**, а не там, где определено. Разберём на примере:

```python norun
# rates.py
def get_rate(currency): ...          # ходит в сеть

# converter.py
from rates import get_rate           # имя get_rate скопировано в модуль converter

def convert(amount, currency):
    return amount * get_rate(currency)
```

`patch("rates.get_rate")` **не сработает**: `converter` уже держит у себя ссылку на исходную функцию, и подмена атрибута модуля `rates` её не трогает. Правильно — `patch("converter.get_rate")`. Если же в `converter.py` написано `import rates` и вызов `rates.get_rate(...)`, то имя ищется в модуле `rates` во время вызова — и тогда подменяют `rates.get_rate`.

Поведение легко проверить без файлов, создав модули прямо в памяти:

```python
import sys
import types
from unittest.mock import patch

rates = types.ModuleType("rates")
rates.get_rate = lambda currency: 1 / 0          # «настоящая» функция ходит в сеть
sys.modules["rates"] = rates

converter = types.ModuleType("converter")
exec("from rates import get_rate\ndef convert(amount, currency):\n    return amount * get_rate(currency)", converter.__dict__)
sys.modules["converter"] = converter

with patch("converter.get_rate", return_value=90.0):
    print(converter.convert(2, "USD"))

with patch("rates.get_rate", return_value=90.0):
    try:
        converter.convert(2, "USD")
    except ZeroDivisionError:
        print("подменили не там — вызвалась настоящая функция")
```

```text
180.0
подменили не там — вызвалась настоящая функция
```

## spec и autospec: мок, который не врёт

Обычный `Mock` принимает любые атрибуты — даже с опечатками. Тест вызовет `client.compelte(...)`, мок радостно вернёт другой мок, тест пройдёт, а настоящий код упадёт с `AttributeError`. Параметр `spec` ограничивает мок интерфейсом настоящего класса:

```python
from unittest.mock import Mock


class LLMClient:
    def complete(self, prompt, temperature=0.0):
        raise RuntimeError("сеть")


loose = Mock()
print(type(loose.compelte("hi")).__name__)

strict = Mock(spec=LLMClient)
try:
    strict.compelte("hi")
except AttributeError as error:
    print("AttributeError:", error)
```

```text
Mock
AttributeError: Mock object has no attribute 'compelte'
```

`create_autospec(LLMClient)` (или `patch(..., autospec=True)`) идёт дальше и проверяет ещё и **сигнатуры** методов: вызов с лишним аргументом упадёт с `TypeError`, как упал бы настоящий.

## MagicMock и AsyncMock

- `MagicMock` — `Mock` с настроенными «магическими» методами: его можно использовать в `with`, `len()`, итерации, `[]`. `patch` по умолчанию создаёт именно `MagicMock`.
- `AsyncMock` — для асинхронного кода из блока 2.7: вызов возвращает корутину, которую нужно дождаться через `await`.

```python
import asyncio
from unittest.mock import AsyncMock


async def ask(client, prompt):
    return (await client.complete(prompt)).upper()


client = AsyncMock()
client.complete.return_value = "готово"
print(asyncio.run(ask(client, "статус?")))
client.complete.assert_awaited_once_with("статус?")
```

```text
ГОТОВО
```

У `AsyncMock` свои проверки: `assert_awaited()`, `assert_awaited_once_with(...)`, `await_count`.

## monkeypatch или patch?

Фикстура `monkeypatch` из прошлого урока тоже подменяет атрибуты: `monkeypatch.setattr(weather.httpx, "get", fake_get)`. Разница в основном в стиле: `monkeypatch` — «родной» для pytest и удобен для окружения (`setenv`), `patch` — стандартная библиотека и сразу даёт мок с записью вызовов. На практике их смешивают: `monkeypatch` для переменных окружения, `Mock`/`patch` для внешних вызовов.

## Разбор задачи: тест повторов без ожидания

Функция повторяет запрос при сетевых ошибках с растущей паузой. Чтобы тест не ждал секунды, `sleep` передаётся параметром:

```python
from unittest.mock import Mock, call

import pytest


def fetch_with_retry(get, url, attempts=3, sleep=None, base_delay=0.5):
    for attempt in range(attempts):
        try:
            return get(url)
        except ConnectionError:
            if attempt == attempts - 1:
                raise
            if sleep is not None:
                sleep(base_delay * 2 ** attempt)


def test_succeeds_after_two_failures():
    get = Mock(side_effect=[ConnectionError(), ConnectionError(), "ok"])
    sleep = Mock()
    assert fetch_with_retry(get, "/x", attempts=3, sleep=sleep) == "ok"
    assert get.call_count == 3
    assert sleep.call_args_list == [call(0.5), call(1.0)]


def test_gives_up():
    get = Mock(side_effect=ConnectionError("down"))
    with pytest.raises(ConnectionError):
        fetch_with_retry(get, "/x", attempts=2, sleep=Mock())
    assert get.call_count == 2


def test_other_errors_are_not_retried():
    get = Mock(side_effect=ValueError("bad json"))
    with pytest.raises(ValueError):
        fetch_with_retry(get, "/x", sleep=Mock())
    get.assert_called_once_with("/x")


for test in [test_succeeds_after_two_failures, test_gives_up, test_other_errors_are_not_retried]:
    test()
print("все тесты прошли")
```

```text
все тесты прошли
```

Три теста проверяют три поведения: успех после сбоев (и правильные паузы), отказ после исчерпания попыток, отсутствие повторов для «постоянных» ошибок. Ни один не ходит в сеть и не ждёт — весь набор выполняется за миллисекунды.

## Попробуйте сами

1. Уберите `sleep=Mock()` из `test_gives_up`. Что изменится? (Подсказка: значение по умолчанию.)
2. Сделайте `get = Mock(spec=["get"])` и вызовите `get.post`. Что произойдёт?
3. Напишите тест, проверяющий, что при `attempts=1` функция не вызывает `sleep` вообще (`assert_not_called`).

## Частые ошибки

- **Подмена не в том модуле.** `patch("rates.get_rate")` при `from rates import get_rate` в тестируемом модуле не действует. Подменяйте имя там, где его ищут во время вызова.
- **Опечатка в проверке.** `mock.assert_called_once_wiht(...)` у старых версий Python молча «проходила» (создавался дочерний мок). Современный `Mock` ловит имена, начинающиеся с `assert`, но опечатки в обычных методах (`client.compelte`) ловит только `spec`.
- **`return_value` вместо `side_effect` для исключения.** `Mock(return_value=TimeoutError())` вернёт объект исключения, а не бросит его.
- **Мок на всё подряд.** Если тест подменяет пять функций внутри проверяемого кода, он проверяет не поведение, а реализацию — любой рефакторинг его сломает. Мокают **границы** системы: сеть, диск, время, случайность.
- **Мок, который не совпадает с реальностью.** Тест передаёт ответ API в формате, которого настоящий сервис не возвращает, — все тесты зелёные, а в продакшене ошибка. Берите формат из документации или реального ответа, используйте `spec`.
- **Забытый `await` с AsyncMock.** Вызов `client.complete(prompt)` без `await` вернёт корутину, а не ответ.

## Где это в AI-инженерии

- **LLM-клиенты**: тесты подменяют вызов модели заготовленными ответами — включая «плохие»: JSON с лишним текстом, пустой ответ, отказ модели — и проверяют, что парсер и логика повторов справляются.
- **Ошибки провайдера**: `side_effect=[RateLimitError(...), ответ]` проверяет повтор после 429, а `side_effect=TimeoutError` — переход на резервного провайдера.
- **Стоимость**: мок записывает все вызовы, и тест проверяет, что кэш действительно экономит запросы: `client.complete.call_count == 1` после двух одинаковых вопросов.
- **Агенты и инструменты**: инструменты агента (поиск, калькулятор, отправка писем) в тестах заменяют моками и проверяют, какие инструменты и с какими аргументами агент решил вызвать.
- **Время и случайность**: TTL кэша, паузы между повторами и выбор примеров для few-shot тестируют с подменёнными `time` и `random`.

## Итоги урока

- Внешние зависимости в тестах подменяют двойниками: тесты становятся быстрыми, бесплатными, стабильными и могут проверять ошибки.
- `Mock` возвращает `return_value`, выполняет `side_effect` (исключение, последовательность, функция) и записывает вызовы; проверки — `assert_called_once_with`, `call_args_list`, `call_count`.
- Проще всего мокать то, что передано параметром: клиент, `sleep`, источник времени.
- `patch("модуль.имя")` подменяет имя там, где его **ищут** при вызове; работает как `with` и как декоратор.
- `spec`/`autospec` не дают моку принимать несуществующие методы; `AsyncMock` — для асинхронного кода.
