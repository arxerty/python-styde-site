# Шпаргалка: ООП — продвинутый

## Специальные методы

| Вызов | Метод | Заметки |
|---|---|---|
| `repr(x)`, консоль, списки | `__repr__` | пишите всегда; запасной для `str` |
| `str(x)`, `print(x)`, `f"{x}"` | `__str__` | вид для пользователя |
| `x == y` | `__eq__` | чужой тип → `return NotImplemented` |
| `hash(x)`, `set`, ключ `dict` | `__hash__` | из тех же полей, что `__eq__`; только для неизменяемых |
| `len(x)` | `__len__` | неотрицательное `int` |
| `bool(x)`, `if x:` | `__bool__` | без него — по `__len__` |
| `x[key]` | `__getitem__` | индекс, ключ, `slice`, кортеж `x[i, j]` |
| `x[key] = v`, `del x[key]` | `__setitem__`, `__delitem__` | |
| `item in x` | `__contains__` | без него — перебор |
| нет атрибута | `__getattr__` | делегирование |

- Нет ключа → `KeyError`, нет позиции → `IndexError` (на `IndexError` останавливается перебор по `__getitem__`).
- `NotImplemented` **возвращают** из операторов; `NotImplementedError` **бросают** из нереализованных методов.

## Перегрузка операторов

```python norun
class Vector:
    def __add__(self, other):                  # v + w
        if not isinstance(other, Vector):
            return NotImplemented              # дать шанс other.__radd__
        return Vector(*(a + b for a, b in zip(self.c, other.c)))   # НОВЫЙ объект

    def __mul__(self, k):                      # v * 3
        return Vector(*(x * k for x in self.c))

    def __rmul__(self, k):                     # 3 * v
        return self * k

    def __radd__(self, other):                 # sum([...]) начинает с 0
        return self if other == 0 else NotImplemented
```

| Оператор | Метод | Отражённый |
|---|---|---|
| `+ - * /` | `__add__ __sub__ __mul__ __truediv__` | `__radd__ __rsub__ __rmul__ __rtruediv__` |
| `@` | `__matmul__` | `__rmatmul__` |
| `-x`, `abs(x)` | `__neg__`, `__abs__` | — |
| `& \|` | `__and__`, `__or__` | `__rand__`, `__ror__` |
| `< <= > >=` | `__lt__ __le__ __gt__ __ge__` | `@functools.total_ordering`: хватит `__eq__` + `__lt__` |

- `a += b` без `__iadd__` → `a = a + b`.
- Перегружайте, только если смысл оператора очевиден.

## dataclasses

```python norun
from dataclasses import dataclass, field, asdict, replace

@dataclass(frozen=True, order=True)       # frozen: неизменяемый + hash; order: < > по полям
class Config:
    model: str                            # поле = атрибут С АННОТАЦИЕЙ
    lr: float = 0.001
    tags: list = field(default_factory=list)            # изменяемое умолчание
    secret: str = field(default="", repr=False)          # не в repr
    calls: int = field(default=0, init=False, compare=False)

    def __post_init__(self):              # проверки, вычисляемые поля
        if self.lr <= 0:
            raise ValueError("lr > 0")

asdict(cfg); astuple(cfg)                 # в словарь / кортеж (рекурсивно)
replace(cfg, lr=0.01)                     # копия с изменениями
```

- Типы **не проверяются** — нужна проверка в `__post_init__` или Pydantic.
- Поля без умолчания — раньше полей с умолчанием.

## Абстрактные классы и протоколы

```python norun
from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable

class Store(ABC):
    @abstractmethod
    def add(self, doc): """Сохранить."""

    @property
    @abstractmethod                       # абстрактное свойство: @property сверху
    def name(self): """Имя."""

    def add_many(self, docs):             # общий код для потомков
        for doc in docs:
            self.add(doc)

@runtime_checkable                        # чтобы работал isinstance
class Embedder(Protocol):
    def embed(self, text: str) -> list: ...
```

| | ABC | Protocol |
|---|---|---|
| Подходит, если | наследует | имеет методы |
| Ошибка | при создании объекта | в mypy / редакторе |
| Для чего | семейство своих классов с общим кодом | что функция ждёт от аргумента |

- `collections.abc`: `Sized`, `Iterable`, `Sequence`, `Mapping`; наследник `Sequence` с `__getitem__` + `__len__` получает `in`, `index`, `count`, `reversed`.

## Композиция против наследования

- «Является» → наследование (неглубокое); «имеет» → композиция (`self.engine = engine`).
- Комбинации возможностей — компонентами, а не подклассами `JsonFileFilteredLogger`.
- Не наследуйте `list`/`dict` ради пары методов — храните коллекцию внутри.
- Стратегия: поведение — объект или функция в параметре (`Ranker(strategy=by_length)`).
- Компоненты передавайте в `__init__` (внедрение зависимостей) — легко подменить в тестах.

## Enum

```python norun
from enum import Enum, StrEnum, IntEnum, Flag, auto

class Status(StrEnum):            # член == строка, сериализуется в JSON
    QUEUED = "queued"
    DONE = "done"

    @property
    def is_final(self):
        return self is Status.DONE

Status("done")      # по значению  (нет → ValueError)
Status["DONE"]      # по имени     (нет → KeyError)
Status.DONE.name, Status.DONE.value
list(Status), len(Status)

class Cap(Flag):
    TEXT = auto(); VISION = auto()
model = Cap.TEXT | Cap.VISION; Cap.VISION in model
```

- Обычный `Enum` **не равен** строке: `Status.DONE == "done"` → `False`.
- `IntEnum` — сравнения и арифметика как у чисел.
- Члены хешируемы — ключи словарей переходов (конечный автомат).

## Частые ошибки

| Ошибка | Симптом | Исправление |
|---|---|---|
| `__eq__` без `__hash__` | `unhashable type` | `__hash__` из тех же полей |
| `raise NotImplemented` | `TypeError` | `return NotImplemented` |
| Оператор меняет `self` | операнды «портятся» | возвращать новый объект |
| Нет `__rmul__`/`__radd__` | `3 * v`, `sum(...)` падают | добавить отражённые методы |
| `items: list = []` в датаклассе | `ValueError` при объявлении | `field(default_factory=list)` |
| `@abstractmethod` без `ABC` | объект создаётся | `class Base(ABC)` |
| `Enum` в `json.dumps` | `not JSON serializable` | `StrEnum` или `.value` |
