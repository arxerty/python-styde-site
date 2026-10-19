# TypedDict, Generic, TypeVar

## Словари с известной структурой

В AI-инженерии повсюду словари фиксированной формы: сообщение диалога `{"role": ..., "content": ...}`, запись датасета `{"text": ..., "label": ...}`, ответ API. Аннотация `dict[str, str]` для них слишком слабая: она не говорит, какие ключи обязаны быть, и не отличает `"role"` от `"rol"`.

**TypedDict** описывает словарь с заданным набором ключей и типом значения для каждого ключа:

```python
from typing import TypedDict


class Message(TypedDict):
    role: str
    content: str


def to_prompt(messages: list[Message]) -> str:
    return "\n".join(f"{m['role']}: {m['content']}" for m in messages)


history: list[Message] = [
    {"role": "system", "content": "Будь краток."},
    {"role": "user", "content": "Что такое TypedDict?"},
]
print(to_prompt(history))
print(type(history[0]).__name__)
```

```text
system: Будь краток.
user: Что такое TypedDict?
dict
```

Обратите внимание на последнюю строку: во время выполнения это **обычный словарь**. TypedDict существует только для анализатора типов: mypy проверит, что у каждого сообщения есть оба ключа, что значения — строки, и подсветит опечатку `m["contnet"]`. Никакой проверки при создании нет — как и у всех аннотаций.

Создать значение можно и вызовом, как класс — результат тоже будет словарём:

```python
from typing import TypedDict


class Sample(TypedDict):
    text: str
    label: int


sample = Sample(text="отличный фильм", label=1)
print(sample, sample == {"text": "отличный фильм", "label": 1})
print(Sample.__required_keys__ == {"text", "label"})
```

```text
{'text': 'отличный фильм', 'label': 1} True
True
```

## Необязательные ключи

По умолчанию все ключи TypedDict обязательны. Для необязательных используют `NotRequired`:

```python
from typing import NotRequired, TypedDict


class ChatMessage(TypedDict):
    role: str
    content: str
    name: NotRequired[str]


def describe(message: ChatMessage) -> str:
    author = message.get("name", message["role"])
    return f"{author}: {message['content']}"


print(describe({"role": "user", "content": "Привет"}))
print(describe({"role": "tool", "content": "42", "name": "calculator"}))
print(sorted(ChatMessage.__optional_keys__))
```

```text
user: Привет
calculator: 42
['name']
```

Для необязательного ключа используйте `.get()` — mypy потребует учесть, что ключа может не быть.

## TypedDict или dataclass?

Оба описывают «запись с полями». Различие — в том, что получается во время выполнения:

| | TypedDict | dataclass |
|---|---|---|
| Во время выполнения | обычный `dict` | объект класса |
| Доступ | `m["role"]` | `m.role` |
| Сериализация в JSON | сразу | через `asdict` |
| Методы и свойства | нет | есть |
| Когда выбирать | данные приходят и уходят как JSON/словари (API, датасеты) | доменные объекты с поведением |

TypedDict идеален для описания чужих форматов: запросов и ответов API, строк JSONL-датасетов. Вы продолжаете работать со словарями, но получаете проверку структуры в редакторе.

## Проблема: функция для любого типа

Напишем функцию «первый элемент списка или значение по умолчанию». Какой тип у результата?

```python
def first_any(items: list, default=None):
    return items[0] if items else default
```

Если написать `-> object` или `-> Any`, связь потеряется: передали список строк — получили «что-то», и редактор не подскажет строковые методы. Нужен способ сказать: «тип результата **тот же**, что тип элементов списка». Для этого существуют **обобщённые типы** (generics) и **переменные типа** (type variables).

## TypeVar: переменная типа

В Python 3.12 переменная типа объявляется прямо в квадратных скобках после имени функции:

```python
def first[T](items: list[T], default: T) -> T:
    return items[0] if items else default


def pairs[K, V](data: dict[K, V]) -> list[tuple[K, V]]:
    return sorted(data.items(), key=lambda item: str(item[0]))


name = first(["Ада", "Алан"], "никто")
score = first([], 0.0)
print(name.upper(), score + 1)
print(pairs({"b": 2, "a": 1}))
```

```text
АДА 1.0
[('a', 1), ('b', 2)]
```

`[T]` объявляет переменную типа `T`. Запись `first[T](items: list[T], default: T) -> T` означает: «для любого типа T: если передан список T и значение T, вернётся T». Анализатор подставляет конкретный тип при каждом вызове: в первом случае `T = str` (и знает, что у `name` есть `.upper()`), во втором `T = float`.

В коде для Python до 3.12 (вы его встретите очень часто) переменную типа объявляют отдельно:

```python
from typing import TypeVar

T = TypeVar("T")


def last(items: list[T]) -> T:
    return items[-1]


print(last([1, 2, 3]), last(["x", "y"]))
```

```text
3 y
```

Смысл тот же, синтаксис старый. Новая запись короче и не засоряет модуль глобальными переменными.

## Ограничения переменных типа

Иногда «любой тип» — слишком широко. Например, функции `largest` нужны элементы, которые можно сравнивать, а функции `total` — числа. Переменную типа можно **ограничить**:

```python
from collections.abc import Sized


def total[N: (int, float)](values: list[N]) -> N:
    result = values[0]
    for value in values[1:]:
        result += value
    return result


def longest[S: Sized](items: list[S]) -> S:
    return max(items, key=len)


print(total([1, 2, 3]), total([0.5, 0.25]))
print(longest(["кот", "гиппопотам", "ёж"]), longest([[1], [1, 2, 3]]))
```

```text
6 0.75
гиппопотам [1, 2, 3]
```

- `[N: (int, float)]` — **набор допустимых типов**: `N` — либо `int`, либо `float` (результат будет того же типа, что и элементы);
- `[S: Sized]` — **верхняя граница**: `S` — любой тип, совместимый с `Sized` из `collections.abc` (у которого есть `__len__`; это протокол из блока 2.2). Строки и списки подходят, числа — нет.

В старом синтаксисе: `TypeVar("N", int, float)` и `TypeVar("S", bound=Sized)`.

## Обобщённые классы

Классы тоже бывают обобщёнными: `list[int]`, `dict[str, float]` — это обобщённые классы стандартной библиотеки. Свой обобщённый класс объявляется так же, с параметрами в квадратных скобках:

```python
class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

    def __len__(self) -> int:
        return len(self._items)


tokens: Stack[str] = Stack()
tokens.push("привет")
tokens.push("мир")
print(tokens.pop(), len(tokens))

numbers = Stack[int]()
numbers.push(42)
print(numbers.pop() + 1)
```

```text
мир 1
43
```

`Stack[str]` — стек строк: mypy не даст положить в него число, а результат `pop()` будет известен как `str`. Во время выполнения `Stack[str]()` и `Stack()` создают одинаковые объекты — параметр типа используется только анализатором.

В старом синтаксисе обобщённый класс наследуется от `Generic[T]`: `class Stack(Generic[T]):`.

## Принимайте широкое, возвращайте конкретное

Для параметров функций часто лучше указывать не конкретную коллекцию, а **абстрактный тип** из `collections.abc` — «то, что нужно функции»:

```python
from collections.abc import Iterable, Mapping, Sequence


def count_tokens(texts: Iterable[str]) -> int:
    return sum(len(text.split()) for text in texts)


def middle[T](items: Sequence[T]) -> T:
    return items[len(items) // 2]


def keys_with_value(data: Mapping[str, int], value: int) -> list[str]:
    return [key for key, v in data.items() if v == value]


print(count_tokens(["a b", "c"]), count_tokens(t for t in ("x y z",)))
print(middle("abcde"), middle((10, 20, 30)))
print(keys_with_value({"a": 1, "b": 2, "c": 1}, 1))
```

```text
3 3
c 20
['a', 'c']
```

- `Iterable[str]` — «что угодно, что можно перебрать»: список, кортеж, генератор, файл. Функции нужен только перебор;
- `Sequence[T]` — индексируемая последовательность с длиной: список, кортеж, строка, `range`;
- `Mapping[K, V]` — словарь только для чтения.

Правило (принцип устойчивости): **параметры — как можно шире** (`Iterable`, `Sequence`, `Mapping`), **результат — как можно конкретнее** (`list[str]`, `dict[str, int]`). Тогда функцию удобно вызывать с разными данными, а результатом удобно пользоваться.

## Разбор задачи: типизированный результат вызова модели

Вызов LLM может закончиться успехом (с данными) или ошибкой. Опишем это обобщённым классом `Result[T]` и TypedDict для ответа API, а затем напишем функцию, которая работает с результатами любого типа:

```python
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypedDict


class Usage(TypedDict):
    input_tokens: int
    output_tokens: int


class ApiResponse(TypedDict):
    text: str
    usage: Usage


@dataclass
class Result[T]:
    value: T | None = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


def safe_call[T](func: Callable[[], T]) -> Result[T]:
    try:
        return Result(value=func())
    except Exception as exc:
        return Result(error=f"{type(exc).__name__}: {exc}")


def fake_api() -> ApiResponse:
    return {"text": "Привет!", "usage": {"input_tokens": 5, "output_tokens": 2}}


def broken_api() -> ApiResponse:
    raise TimeoutError("нет ответа")


good = safe_call(fake_api)
bad = safe_call(broken_api)
if good.ok and good.value is not None:
    usage = good.value["usage"]
    print(good.value["text"], usage["input_tokens"] + usage["output_tokens"])
print(bad.ok, bad.error)
```

```text
Привет! 7
False TimeoutError: нет ответа
```

Что дают типы:

- `ApiResponse` и `Usage` описывают форму JSON-ответа: редактор подскажет ключи `text` и `usage`, а опечатку `usage["input_token"]` найдёт mypy;
- `Result[T]` — один класс для результатов любого типа; `safe_call(fake_api)` анализатор понимает как `Result[ApiResponse]`;
- проверка `good.value is not None` сужает `ApiResponse | None` до `ApiResponse`.

Обобщённые классы-обёртки вроде `Result[T]` часто встречаются в API-клиентах и фреймворках агентов.

## Попробуйте сами

- Опишите TypedDict для строки датасета вопросов и ответов: `question`, `answer`, необязательный `context`.
- Напишите обобщённую функцию `chunk[T](items: Sequence[T], size: int) -> list[list[T]]`.
- Сделайте обобщённый класс `Cache[K, V]` с методами `get(key: K) -> V | None` и `set(key: K, value: V) -> None`.

## Частые ошибки

**1. Ожидание проверки TypedDict во время выполнения.** `Message(role=1)` создастся без ошибок — это обычный словарь. Для проверки данных используйте Pydantic.

**2. Доступ к необязательному ключу через `[]`.** `message["name"]` упадёт с `KeyError`, если ключа нет. Используйте `.get()`.

**3. `Any` или `object` вместо переменной типа.** Связь «вход → выход» теряется, и редактор не знает тип результата.

**4. Переменная типа, встречающаяся один раз.** `def f[T](x: T) -> None` — `T` ничего не связывает; пишите просто `object`.

**5. Слишком конкретные параметры.** `def count(texts: list[str])` не примет кортеж или генератор (с точки зрения mypy). Если нужен только перебор — `Iterable[str]`.

**6. Изменяемые коллекции в параметрах по умолчанию.** Не связано с типами, но встречается в типизированном коде так же часто: `def f(items: list[str] = [])` — та же ловушка, что в блоке 1.6.

## Где это в AI-инженерии

- **SDK OpenAI и Anthropic** описывают параметры запросов TypedDict-ами: сообщения, инструменты, параметры ответа — редактор подсказывает допустимые ключи.
- **Строки датасетов** (JSONL для дообучения: `{"messages": [...]}`) удобно описывать TypedDict и проверять mypy в скриптах подготовки данных.
- **Обобщённые классы** в библиотеках: `Dataset[T]` и `DataLoader[T]` в PyTorch, `Runnable[Input, Output]` в LangChain — параметры типа говорят, что на входе и выходе.
- **`Iterable` и `Sequence`** в сигнатурах функций обработки данных позволяют передавать и списки, и генераторы, и датасеты.
- **Обёртки результатов** вроде `Result[T]` — для явной обработки ошибок при вызовах внешних сервисов.

## Итоги урока

- `TypedDict` описывает словарь с фиксированными ключами; во время выполнения — обычный `dict`; `NotRequired` — необязательный ключ.
- TypedDict — для данных в виде JSON/словарей; dataclass — для объектов с поведением.
- Переменная типа связывает типы входа и выхода: `def first[T](items: list[T]) -> T` (или `T = TypeVar("T")`).
- Ограничения: `[N: (int, float)]` — набор типов, `[S: Sized]` — верхняя граница.
- Обобщённые классы: `class Stack[T]` (или `Generic[T]`); `Stack[str]` — стек строк для анализатора.
- Параметры — широкие (`Iterable`, `Sequence`, `Mapping`), результат — конкретный.
