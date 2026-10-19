# Фикстуры и параметризация

## Проблема: повторяющаяся подготовка

В прошлом уроке каждый тест сам готовил данные. Пока данные — это пара чисел, всё хорошо. Но реальные тесты часто начинаются одинаково: создать временную папку, положить туда файл с историей чата, собрать объект клиента с тестовыми настройками, открыть соединение с базой. Если копировать эти пять строк в каждый из двадцати тестов, получится:

- **дублирование**: поменялся формат файла — правим двадцать мест;
- **шум**: за подготовкой не видно, что именно проверяет тест;
- **утечки**: кто-то забыл удалить временный файл или закрыть соединение, и следующий тест падает из-за «мусора» от предыдущего.

Вторая типичная проблема — однотипные тесты. Функция разбора размера файла должна понимать `"10KB"`, `"1.5MB"`, `"2gb"`, `"512"`. Четыре почти одинаковые функции `test_kb`, `test_mb`, `test_gb`, `test_bytes` отличаются только входом и ожидаемым ответом.

pytest решает обе проблемы: подготовку выносят в **фикстуры**, а однотипные проверки — в **параметризованные** тесты.

## Фикстура: подготовка как функция

Фикстура — функция с декоратором `@pytest.fixture`, которая готовит и возвращает объект для теста. Тест получает фикстуру, просто **назвав параметр** её именем:

```python norun
import pytest


@pytest.fixture
def messages():
    return [
        {"role": "system", "content": "Ты — помощник."},
        {"role": "user", "content": "Привет!"},
    ]


def test_first_is_system(messages):
    assert messages[0]["role"] == "system"


def test_append_does_not_leak(messages):
    messages.append({"role": "assistant", "content": "Здравствуйте!"})
    assert len(messages) == 3


def test_fresh_copy(messages):
    assert len(messages) == 2
```

Перед запуском `test_first_is_system` pytest видит параметр `messages`, находит фикстуру с этим именем, вызывает её и передаёт результат в тест. Это называют **внедрением зависимостей** (dependency injection): тест объявляет, что ему нужно, а не создаёт это сам.

Важная деталь: по умолчанию фикстура вызывается **заново для каждого теста**. Поэтому `test_fresh_copy` получает чистый список из двух элементов, хотя предыдущий тест добавил в «свой» список третий. Тесты остаются независимыми — именно этого мы добивались в уроке 1.

Фикстуры могут зависеть от других фикстур — тоже через параметры:

```python norun
@pytest.fixture
def settings():
    return {"model": "mini", "temperature": 0.0, "max_tokens": 100}


@pytest.fixture
def client(settings):
    return FakeLLMClient(**settings)


def test_client_uses_settings(client):
    assert client.model == "mini"
```

pytest сам выстраивает порядок: чтобы создать `client`, сначала нужна `settings`. Внутри одного теста каждая фикстура создаётся **один раз**: если и тест, и `client` запросят `settings`, они получат один и тот же объект.

## yield: подготовка и уборка

Часто после теста нужно прибраться: удалить файлы, закрыть соединение, вернуть настройки. Для этого фикстура пишется как генератор (блок 2.2): всё до `yield` — подготовка, значение после `yield` — то, что получит тест, всё после `yield` — уборка.

```python norun
@pytest.fixture
def db_connection():
    connection = connect("sqlite:///:memory:")   # подготовка
    yield connection                              # тест работает с connection
    connection.close()                            # уборка — даже если тест упал
```

Как это работает, легко понять, если самим «прокрутить» генератор так, как это делает pytest:

```python
def resource():
    print("подготовка")
    yield "ресурс"
    print("уборка")


fixture = resource()
value = next(fixture)            # pytest: выполнить код до yield
try:
    print("тест получил:", value)
    assert value == "другое"     # тест падает
except AssertionError:
    print("тест упал")
finally:
    next(fixture, None)          # pytest: продолжить генератор после yield
```

```text
подготовка
тест получил: ресурс
тест упал
уборка
```

Уборка выполняется **всегда**, даже если тест упал, — поэтому `yield`-фикстура надёжнее, чем код очистки в конце теста (до него при падении дело не дойдёт). Если фикстур несколько, уборка идёт в обратном порядке: последней создана — первой убрана, как при вложенных `with`.

## Область действия: scope

Некоторые ресурсы дорого создавать: загрузка модели эмбеддингов, запуск тестовой базы данных. Параметр `scope` задаёт, как долго живёт фикстура:

| scope | Сколько раз создаётся |
|---|---|
| `"function"` (по умолчанию) | для каждого теста |
| `"class"` | один раз на класс с тестами |
| `"module"` | один раз на файл |
| `"package"` | один раз на пакет |
| `"session"` | один раз на весь запуск pytest |

```python norun
@pytest.fixture(scope="session")
def embedder():
    return load_embedding_model("small-model")   # 5 секунд — один раз на запуск
```

Цена — общее состояние: если тест изменит объект с `scope="session"`, это увидят все следующие тесты. Широкий scope подходит для **неизменяемых** или «только для чтения» ресурсов. Изменяемые данные (списки, словари, файлы) держите в `function`-фикстурах.

## conftest.py: общие фикстуры

Фикстуры, нужные в нескольких файлах тестов, кладут в файл `conftest.py`. pytest находит его автоматически — **импортировать фикстуры не нужно** (и не стоит):

```text
project/
├── chat/
│   └── history.py
└── tests/
    ├── conftest.py          # фикстуры для всех тестов в tests/
    ├── test_history.py
    └── test_export.py
```

`conftest.py` действует на свою папку и все вложенные. Можно иметь несколько: общий в `tests/` и более специфичный в `tests/api/`.

## Встроенные фикстуры

pytest поставляется с готовыми фикстурами. Самые полезные:

- **`tmp_path`** — уникальная временная папка (`pathlib.Path`) для каждого теста. Файлы в ней не мешают другим тестам и не мусорят в проекте.
- **`monkeypatch`** — временно меняет переменные окружения, атрибуты объектов, элементы словарей; после теста всё возвращается как было.
- **`capsys`** — перехватывает `print`: `capsys.readouterr().out` возвращает напечатанное.
- **`caplog`** — перехватывает сообщения `logging` (подробнее — в уроке 5).

```python norun
import json


def save_history(messages, path):
    path.write_text(json.dumps(messages, ensure_ascii=False), encoding="utf-8")


def test_save_history(tmp_path):
    path = tmp_path / "history.json"
    save_history([{"role": "user", "content": "Привет"}], path)
    assert json.loads(path.read_text(encoding="utf-8"))[0]["content"] == "Привет"


def test_reads_model_from_env(monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "mini")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    assert load_settings().model == "mini"


def test_greeting_output(capsys):
    print("Привет, мир")
    assert capsys.readouterr().out == "Привет, мир\n"
```

`monkeypatch.setenv` особенно важен для кода из блока 2.7, который читает настройки из окружения: тест задаёт нужные переменные и не зависит от того, что настроено на компьютере разработчика.

## Параметризация: один тест — много случаев

Декоратор `@pytest.mark.parametrize` запускает тест несколько раз с разными аргументами:

```python norun
import pytest


@pytest.mark.parametrize(
    "text, expected",
    [
        ("512", 512),
        ("10KB", 10 * 1024),
        ("1.5MB", int(1.5 * 1024 ** 2)),
        ("2gb", 2 * 1024 ** 3),
        (" 7 KB ", 7 * 1024),
    ],
)
def test_parse_size(text, expected):
    assert parse_size(text) == expected
```

Первый аргумент — имена параметров через запятую, второй — список кортежей значений. pytest создаёт пять отдельных тестов, и каждый падает или проходит сам по себе:

```text
$ pytest -v
test_size.py::test_parse_size[512-512] PASSED
test_size.py::test_parse_size[10KB-10240] PASSED
test_size.py::test_parse_size[1.5MB-1572864] PASSED
test_size.py::test_parse_size[2gb-2147483648] FAILED
test_size.py::test_parse_size[ 7 KB -7168] PASSED
```

В квадратных скобках — **идентификатор случая**, собранный из значений. Сразу видно, на каком входе ошибка. Для сложных значений (словарей, объектов) pytest пишет `text0`, `text1`… — тогда удобнее задать имена явно:

```python norun
@pytest.mark.parametrize(
    "payload",
    [{"role": "user"}, {"content": "hi"}, {}],
    ids=["no-content", "no-role", "empty"],
)
def test_invalid_message(payload):
    with pytest.raises(ValueError):
        validate_message(payload)
```

Если параметр один, кортежи не нужны: `@pytest.mark.parametrize("bad", ["", "abc", "-5", "10XB"])`.

Несколько декораторов `parametrize` над одним тестом дают **все комбинации** (декартово произведение): 3 модели × 4 температуры = 12 тестов.

```python norun
@pytest.mark.parametrize("model", ["mini", "large", "reasoner"])
@pytest.mark.parametrize("temperature", [0.0, 0.5, 1.0, 2.0])
def test_request_is_valid(model, temperature):
    assert build_request(model, temperature)["model"] == model
```

## pytest.param и метки

Отдельному случаю можно дать имя и метку через `pytest.param`:

```python norun
@pytest.mark.parametrize(
    "text, expected",
    [
        ("10KB", 10240),
        pytest.param("1e3", 1000, id="scientific"),
        pytest.param("10 TB", 10 * 1024 ** 4, marks=pytest.mark.xfail(reason="TB пока не поддерживаем")),
    ],
)
def test_parse_size_more(text, expected):
    assert parse_size(text) == expected
```

Метки (`marks`) управляют запуском:

- `@pytest.mark.skip(reason="...")` — не запускать тест;
- `@pytest.mark.skipif(sys.platform == "win32", reason="...")` — пропустить при условии;
- `@pytest.mark.xfail(reason="...")` — ожидаемо падающий тест (известный баг): его падение не ломает сборку, а неожиданное прохождение отмечается как `XPASS`;
- свои метки, например `@pytest.mark.slow` или `@pytest.mark.network`, — чтобы запускать или исключать группы тестов: `pytest -m "not slow"`.

Свои метки регистрируют в `pyproject.toml` (о нём — в уроке 4), иначе pytest предупредит об опечатке:

```toml
[tool.pytest.ini_options]
markers = [
    "slow: долгие тесты",
    "network: тесты, которым нужна сеть",
]
```

## Параметризованные фикстуры

Иногда нужно прогнать **все** тесты для нескольких вариантов ресурса — например, для двух реализаций хранилища. Для этого у фикстуры есть параметр `params`, а текущий вариант доступен через специальную фикстуру `request`:

```python norun
@pytest.fixture(params=["memory", "json"])
def store(request, tmp_path):
    if request.param == "memory":
        return MemoryStore()
    return JsonStore(tmp_path / "store.json")


def test_put_and_get(store):       # запустится дважды: [memory] и [json]
    store.put("k", "v")
    assert store.get("k") == "v"
```

Каждый тест, использующий `store`, запустится для обеих реализаций — так проверяют, что они ведут себя одинаково.

## Разбор задачи: тесты для хранилища истории чата

Модуль хранит историю диалога в JSON-файле, путь к которому берётся из переменной окружения `CHAT_HISTORY`. Тесты не должны трогать настоящий файл пользователя. Решение — фикстура, которая направляет хранилище во временную папку:

```python norun
# conftest.py
import pytest


@pytest.fixture
def history_file(tmp_path, monkeypatch):
    path = tmp_path / "history.json"
    monkeypatch.setenv("CHAT_HISTORY", str(path))
    return path
```

```python norun
# test_history.py
import pytest

from history import append, last, load


def test_empty_history(history_file):
    assert load() == []
    assert not history_file.exists()


def test_append_creates_file(history_file):
    append("user", "Привет")
    assert history_file.exists()
    assert load() == [{"role": "user", "text": "Привет"}]


@pytest.mark.parametrize("role", ["robot", "", "USER"])
def test_invalid_role(history_file, role):
    with pytest.raises(ValueError):
        append(role, "текст")


@pytest.mark.parametrize("n, expected", [(0, []), (1, ["c"]), (2, ["b", "c"]), (10, ["a", "b", "c"])])
def test_last(history_file, n, expected):
    for text in ["a", "b", "c"]:
        append("user", text)
    assert [m["text"] for m in last(n)] == expected
```

Обратите внимание на сочетание: тест `test_last` использует и фикстуру `history_file`, и параметры `n, expected`. pytest для каждого из четырёх случаев создаёт свежую временную папку — случаи не влияют друг на друга. А случай `n=0` ловит классическую ошибку: `messages[-0:]` — это **весь** список, а не пустой.

## Попробуйте сами

1. Напишите фикстуру с `yield`, которая печатает «подготовка» и «уборка», и запустите с ней два теста с ключом `pytest -s`. В каком порядке идут строки? А если поставить `scope="module"`?
2. Параметризуйте тест для `chunk_words` из урока 1 так, чтобы все случаи были в одном тесте.
3. Сделайте один случай `xfail` и посмотрите, как он выглядит в отчёте.

## Частые ошибки

- **Вызов фикстуры напрямую.** `messages()` внутри теста — ошибка: pytest запрещает вызывать фикстуры как обычные функции. Фикстуру получают только через параметр.
- **Импорт фикстур из conftest.py.** `from conftest import client` не нужен и ломает механизм поиска. pytest подключает `conftest.py` сам.
- **Изменяемый объект в широком scope.** Фикстура `scope="session"` возвращает список, один тест его меняет — другие тесты начинают падать или проходить в зависимости от порядка запуска.
- **Уборка после `return`.** Код после `return` не выполнится никогда; для уборки нужен `yield`.
- **Опечатка в имени параметра parametrize.** `parametrize("text, expect", ...)` при параметре функции `expected` даёт ошибку сбора: имена в строке и в сигнатуре должны совпадать.
- **Ошибочный кортеж из одного значения.** Для одного параметра пишут список значений: `["a", "b"]`. Если пишете кортежи, не забывайте запятую: `("a",)`.
- **Слишком много логики в параметрах.** Если ожидаемое значение вычисляется той же формулой, что и в коде, тест проверяет сам себя. Ожидаемые значения записывают явно.

## Где это в AI-инженерии

- **Eval-наборы**: каждый пример из набора «вопрос — ожидаемый ответ» становится случаем `parametrize`, а отчёт pytest показывает, на каких примерах модель или промпт ошибаются.
- **Дорогие ресурсы**: модель эмбеддингов, токенизатор, векторный индекс с тестовыми документами создаются в фикстурах `scope="session"` — один раз на запуск.
- **Конфигурация**: `monkeypatch.setenv` задаёт тестовые API-ключи и адреса, `tmp_path` — папки для кэша и истории, так что тесты не трогают настоящие ключи и файлы.
- **Несколько провайдеров**: параметризованная фикстура прогоняет одни и те же тесты для клиентов разных LLM-провайдеров с общим интерфейсом.
- **Метки**: медленные тесты, которым нужна настоящая модель, помечают `@pytest.mark.slow` и запускают отдельно, например раз в сутки, а не на каждый коммит.

## Итоги урока

- Фикстура — функция с `@pytest.fixture`; тест получает её, назвав параметр её именем. По умолчанию она создаётся заново для каждого теста.
- `yield` в фикстуре разделяет подготовку и уборку; уборка выполняется даже при падении теста.
- `scope` задаёт время жизни; широкий scope — только для неизменяемых дорогих ресурсов.
- Общие фикстуры живут в `conftest.py`; встроенные `tmp_path`, `monkeypatch`, `capsys` изолируют тесты от файлов, окружения и вывода.
- `@pytest.mark.parametrize` превращает один тест в много случаев с понятными идентификаторами; `pytest.param` задаёт имя и метки отдельному случаю, несколько декораторов дают все комбинации.
