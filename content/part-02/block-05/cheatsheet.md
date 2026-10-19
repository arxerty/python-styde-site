# Шпаргалка: типизация и валидация

## Аннотации типов

```python norun
def average(scores: list[float], digits: int = 2) -> float: ...
def log(message: str) -> None: ...
max_tokens: int = 512

type Vector = list[float]               # псевдоним (3.12); раньше: Vector = list[float]
```

| Аннотация | Смысл |
|---|---|
| `list[int]`, `set[str]` | коллекция однотипных элементов |
| `dict[str, float]` | ключи-строки, значения-дробные |
| `tuple[int, str]` / `tuple[float, ...]` | фиксированная структура / любая длина |
| `str \| None` (`Optional[str]`) | строка или None |
| `int \| str` (`Union[int, str]`) | одно из нескольких |
| `Literal["train", "test"]` | только эти значения |
| `Callable[[int, str], bool]` | функция (из `collections.abc`) |
| `Any` / `object` | что угодно без проверок / что угодно с проверками |
| `*args: str`, `**kwargs: int` | тип одного элемента |

- **Python не проверяет аннотации при выполнении** — их читают mypy, редакторы, Pydantic, FastAPI.
- `typing.get_type_hints(f)` — аннотации во время выполнения.
- Необязательный параметр: `x: str | None = None`; проверка — `if x is None`, а не `if not x`.
- Параметры — широкие (`Iterable`, `Sequence`, `Mapping`), результат — конкретный (`list`, `dict`).

## TypedDict и обобщённые типы

```python norun
from typing import NotRequired, TypedDict, TypeVar

class Message(TypedDict):          # во время выполнения — обычный dict
    role: str
    content: str
    name: NotRequired[str]         # ключа может не быть → message.get("name")

def first[T](items: list[T], default: T) -> T: ...      # 3.12
T = TypeVar("T")                                         # старый синтаксис
def longest[S: Sized](items: list[S]) -> S: ...          # верхняя граница
def total[N: (int, float)](xs: list[N]) -> N: ...        # набор типов

class Stack[T]:                    # обобщённый класс; раньше: class Stack(Generic[T])
    def push(self, item: T) -> None: ...
```

## mypy

```bash
pip install mypy
mypy app.py
mypy --strict src/
```

```text
app.py:14: error: Item "None" of "str | None" has no attribute "upper"  [union-attr]
```

| Код | Причина |
|---|---|
| `arg-type` | аргумент не того типа |
| `return-value` | возвращается не то, что обещано |
| `union-attr` | атрибут у значения, которое может быть None |
| `assignment` | присваивание несовместимого типа |
| `call-arg` | лишний/недостающий аргумент |

- Неаннотированные функции не проверяются → `--strict` / `disallow_untyped_defs`.
- `reveal_type(x)` — показать выведенный тип.
- `# type: ignore[код]`, `cast(T, x)` — точечные исключения (cast ничего не проверяет!).
- Настройки: `[tool.mypy]` в `pyproject.toml` (`strict = true`).

## Pydantic: модели

```python norun
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

class Config(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, pattern=r"^[a-z_]+$")
    lr: float = Field(gt=0, le=1)
    optimizer: Literal["adam", "sgd"] = "adam"
    tags: list[str] = []                       # безопасно: копия на каждый объект
    layers: list[Layer] = Field(min_length=1)  # вложенные модели

    @field_validator("name", mode="before")    # before — до проверки типа
    @classmethod
    def lower(cls, v): return v.lower() if isinstance(v, str) else v

    @model_validator(mode="after")             # после всех полей
    def check(self) -> "Config":
        if ...: raise ValueError("сообщение")
        return self
```

| Действие | Код |
|---|---|
| Создать из словаря | `Config(**data)`, `Config.model_validate(data)` |
| Из JSON | `Config.model_validate_json(text)` |
| В словарь / JSON | `cfg.model_dump()`, `cfg.model_dump_json()`, `exclude_none=True`, `by_alias=True` |
| Копия с изменениями | `cfg.model_copy(update={"lr": 0.1})` |
| JSON-схема | `Config.model_json_schema()` |
| Список моделей | `TypeAdapter(list[Item]).validate_json(text)` |
| Чужие имена ключей | `Field(alias="maxTokens")` |

Ошибки: `except ValidationError as e:` → `e.errors()` — список `{"loc", "type", "msg", "input"}`; `e.error_count()`. Не сравнивайте `str(e)` в коде — он зависит от версии.

Частые `type`: `missing`, `int_parsing`, `float_parsing`, `greater_than`, `less_than_equal`, `string_too_short`, `too_short`, `literal_error`, `extra_forbidden`, `json_invalid`, `value_error`.

## Structured output

1. Описать ответ моделью Pydantic (`Literal` для меток, `Field(description=...)`).
2. Передать `model_json_schema()` модели (промпт / инструмент / параметр API).
3. Извлечь JSON из ответа (```` ```json ```` или `{` … `}`) и `model_validate_json`.
4. При `ValidationError` — повторить запрос с текстом ошибок `путь: type`.

## Частые ошибки

| Ошибка | Исправление |
|---|---|
| Ожидание проверки аннотаций при выполнении | Pydantic или явные проверки |
| `-> str`, а функция иногда возвращает None | `-> str \| None` |
| `if value:` для «есть ли значение» | `if value is not None:` |
| `Any` повсюду | точные типы, `object` |
| Голый `# type: ignore` | `# type: ignore[код]` или исправить причину |
| Валидатор без `return` | вернуть значение (`self` в model_validator) |
| Нет `@classmethod` под `@field_validator` | добавить |
| Опечатки в конфиге проходят молча | `extra="forbid"` |
| `model_dump()` для API с camelCase | `model_dump(by_alias=True)` |
