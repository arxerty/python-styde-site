# Pydantic: модели, валидация, ошибки валидации

## Аннотации, которые проверяются

Весь блок звучал одно и то же предупреждение: Python аннотации не проверяет. В уроке 3 вы вручную писали проверки для строк датасета — длинные цепочки `isinstance`. А ведь данные из внешнего мира — JSON от API, конфигурации из файлов, ответы LLM, формы пользователей — **обязательно** нужно проверять: они могут быть какими угодно.

**Pydantic** — библиотека, которая превращает аннотации типов в **проверку и преобразование данных во время выполнения**. Вы описываете модель данных обычными аннотациями, а Pydantic гарантирует: если объект модели создан, данные в нём соответствуют описанию. Это самая популярная библиотека валидации в Python: на ней построены FastAPI, конфигурации многих ML-инструментов и SDK для LLM (OpenAI, Anthropic).

Установка: `pip install pydantic` (на сайте библиотека подгружается автоматически при `import`).

## Первая модель

Модель — класс, наследующий `BaseModel`, с полями-аннотациями (синтаксис как у dataclass):

```python
from pydantic import BaseModel


class Experiment(BaseModel):
    name: str
    learning_rate: float
    epochs: int = 10
    tags: list[str] = []


exp = Experiment(name="baseline", learning_rate="0.001", epochs="5")
print(exp)
print(repr(exp))
print(type(exp.learning_rate).__name__, type(exp.epochs).__name__)
```

```text
name='baseline' learning_rate=0.001 epochs=5 tags=[]
Experiment(name='baseline', learning_rate=0.001, epochs=5, tags=[])
float int
```

Обратите внимание на третью строку: мы передали **строки** `"0.001"` и `"5"`, а Pydantic **преобразовал** их к аннотированным типам. По умолчанию Pydantic работает в «нестрогом» режиме: если значение можно однозначно привести к нужному типу (строка `"5"` → число 5), он это делает. Данные из JSON, переменных окружения и форм часто приходят строками — такое поведение очень удобно.

И ещё: `tags: list[str] = []` — изменяемое значение по умолчанию **безопасно** в Pydantic: каждая модель получает свою копию. В отличие от dataclass и обычных функций, здесь ловушки нет.

## Ошибки валидации

Если данные не подходят, создание модели падает с исключением `ValidationError`, в котором перечислены **все** найденные проблемы сразу:

```python
from pydantic import BaseModel, ValidationError


class Experiment(BaseModel):
    name: str
    learning_rate: float
    epochs: int = 10


try:
    Experiment(learning_rate="быстро", epochs="десять")
except ValidationError as error:
    print("ошибок:", error.error_count())
    for item in error.errors():
        print(item["loc"], item["type"], "—", item["msg"])
```

```text
ошибок: 3
('name',) missing — Field required
('learning_rate',) float_parsing — Input should be a valid number, unable to parse string as a number
('epochs',) int_parsing — Input should be a valid integer, unable to parse string as an integer
```

Метод `errors()` возвращает список словарей, у каждого:

- `loc` — путь к ошибочному полю (кортеж; для вложенных моделей — несколько элементов);
- `type` — машиночитаемый код ошибки (`missing`, `int_parsing`, `greater_than`...);
- `msg` — понятное описание;
- также `input` — значение, которое не прошло проверку.

Все ошибки сразу, а не по одной, — большое удобство: пользователь конфигурации увидит полный список проблем, а не будет исправлять их по одной за запуск. `str(error)` даёт готовый многострочный текст со всеми ошибками — его удобно показывать в логах.

## Ограничения полей: Field

Типа часто мало: learning rate должен быть положительным, имя — непустым, вероятность — от 0 до 1. Для ограничений используется функция `Field`:

```python
from pydantic import BaseModel, Field, ValidationError


class TrainingConfig(BaseModel):
    model_name: str = Field(min_length=2, max_length=50)
    learning_rate: float = Field(gt=0, le=1)
    batch_size: int = Field(default=32, ge=1, le=4096)
    dropout: float = Field(default=0.1, ge=0, lt=1)
    seed: int | None = None


print(TrainingConfig(model_name="bert", learning_rate=3e-5))
try:
    TrainingConfig(model_name="b", learning_rate=0, batch_size=0)
except ValidationError as error:
    for item in error.errors():
        print(item["loc"][0], "—", item["msg"])
```

```text
model_name='bert' learning_rate=3e-05 batch_size=32 dropout=0.1 seed=None
model_name — String should have at least 2 characters
learning_rate — Input should be greater than 0
batch_size — Input should be greater than or equal to 1
```

| Параметр `Field` | Смысл |
|---|---|
| `gt`, `ge`, `lt`, `le` | больше, больше или равно, меньше, меньше или равно (числа) |
| `min_length`, `max_length` | длина строки или коллекции |
| `pattern` | регулярное выражение для строки |
| `default`, `default_factory` | значение по умолчанию / фабрика для него |
| `description` | описание поля (попадает в JSON-схему — урок 6) |

Поле с аннотацией `int | None = None` — необязательное: его можно не передавать или передать `None`.

## Literal и Enum в моделях

Ограниченные наборы значений из уроков 2 и 2.2 Pydantic проверяет во время выполнения:

```python
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ValidationError


class Optimizer(StrEnum):
    SGD = "sgd"
    ADAM = "adam"


class RunConfig(BaseModel):
    split: Literal["train", "val", "test"]
    optimizer: Optimizer = Optimizer.ADAM


run = RunConfig(split="val", optimizer="sgd")
print(run.split, run.optimizer is Optimizer.SGD)
try:
    RunConfig(split="dev")
except ValidationError as error:
    print(error.errors()[0]["msg"])
```

```text
val True
Input should be 'train', 'val' or 'test'
```

Строка `"sgd"` превратилась в член перечисления `Optimizer.SGD`, а недопустимое `"dev"` отвергнуто с понятным сообщением. Аннотация `Literal`, которая в обычном коде только подсказывала mypy, здесь стала настоящей проверкой.

## Вложенные модели

Поле модели может быть другой моделью или списком моделей — Pydantic проверит всю структуру рекурсивно:

```python
from pydantic import BaseModel, Field, ValidationError


class Layer(BaseModel):
    units: int = Field(gt=0)
    activation: str = "relu"


class Network(BaseModel):
    name: str
    layers: list[Layer] = Field(min_length=1)


net = Network(name="mlp", layers=[{"units": 64}, {"units": 10, "activation": "softmax"}])
print(net.layers[1].activation, len(net.layers))
try:
    Network(name="bad", layers=[{"units": 64}, {"units": -1}])
except ValidationError as error:
    print(error.errors()[0]["loc"], error.errors()[0]["msg"])
```

```text
softmax 2
('layers', 1, 'units') Input should be greater than 0
```

Словари `{"units": 64}` автоматически превратились в объекты `Layer`. А путь ошибки `('layers', 1, 'units')` точно указывает: поле `units` во **втором** (индекс 1) слое. Для больших конфигураций это бесценно.

## Свои проверки: field_validator и model_validator

Когда встроенных ограничений не хватает, пишут свои проверки. Декоратор `@field_validator` проверяет (и может преобразовать) одно поле, `@model_validator` — модель целиком, когда проверка затрагивает несколько полей:

```python
from pydantic import BaseModel, ValidationError, field_validator, model_validator


class DataSplit(BaseModel):
    train_ratio: float
    val_ratio: float
    test_ratio: float
    name: str

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip().lower()
        if not value.isidentifier():
            raise ValueError("имя должно быть идентификатором")
        return value

    @model_validator(mode="after")
    def check_sum(self) -> "DataSplit":
        total = self.train_ratio + self.val_ratio + self.test_ratio
        if abs(total - 1) > 1e-9:
            raise ValueError(f"доли должны в сумме давать 1, получено {total:.2f}")
        return self


print(DataSplit(train_ratio=0.8, val_ratio=0.1, test_ratio=0.1, name="  Main_Split "))
try:
    DataSplit(train_ratio=0.8, val_ratio=0.3, test_ratio=0.1, name="x")
except ValidationError as error:
    print(error.errors()[0]["msg"])
```

```text
train_ratio=0.8 val_ratio=0.1 test_ratio=0.1 name='main_split'
Value error, доли должны в сумме давать 1, получено 1.20
```

Правила написания валидаторов:

- `@field_validator("поле")` ставится над `@classmethod`; метод получает уже приведённое к типу значение и **возвращает** итоговое значение (здесь — нормализованное имя);
- `@model_validator(mode="after")` — обычный метод, вызывается после проверки всех полей и возвращает `self`;
- ошибка сигнализируется обычным `raise ValueError(...)` — Pydantic превратит её в элемент `ValidationError` с префиксом «Value error,».

## Работа с моделями: dump, copy, настройки

```python
from pydantic import BaseModel, ConfigDict, ValidationError


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    model: str
    temperature: float = 0.7
    stop: list[str] | None = None


s = Settings(model="  mini  ")
print(s.model_dump())
print(s.model_dump(exclude_none=True))
hot = s.model_copy(update={"temperature": 1.2})
print(hot.temperature, s.temperature)
try:
    Settings(model="mini", temprature=0.5)
except ValidationError as error:
    print(error.errors()[0]["loc"], error.errors()[0]["type"])
```

```text
{'model': 'mini', 'temperature': 0.7, 'stop': None}
{'model': 'mini', 'temperature': 0.7}
1.2 0.7
('temprature',) extra_forbidden
```

- `model_dump()` — словарь из модели (рекурсивно для вложенных); `exclude_none=True` убирает пустые поля — удобно для запросов к API;
- `model_copy(update={...})` — копия с изменёнными полями;
- `model_config = ConfigDict(...)` — настройки модели. `extra="forbid"` запрещает неизвестные поля — и опечатка `temprature` сразу становится ошибкой, а не молча игнорируется (по умолчанию лишние поля игнорируются). `str_strip_whitespace=True` убирает пробелы по краям всех строк.

Ещё полезные настройки: `frozen=True` (неизменяемая модель, как `frozen` dataclass) и `strict=True` (без преобразования типов: `"5"` для `int` будет ошибкой).

## Разбор задачи: проверка входящих записей датасета

Вернёмся к задаче урока 3 — загрузке строк датасета — и решим её на Pydantic. Сравните объём кода с ручными проверками:

```python
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class Sample(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(min_length=1)
    label: Literal[0, 1]
    source: str | None = None


def load_samples(rows: list[dict[str, object]]) -> tuple[list[Sample], list[str]]:
    samples: list[Sample] = []
    problems: list[str] = []
    for index, row in enumerate(rows):
        try:
            samples.append(Sample.model_validate(row))
        except ValidationError as error:
            fields = ", ".join(str(item["loc"][0]) for item in error.errors())
            problems.append(f"строка {index}: {fields}")
    return samples, problems


rows = [
    {"text": " отличный фильм ", "label": 1, "source": "imdb"},
    {"text": "   ", "label": 0},
    {"text": "скучно", "label": "0"},
    {"text": "так себе", "label": 5},
]
samples, problems = load_samples(rows)
print([(s.text, s.label) for s in samples])
print(problems)
```

```text
[('отличный фильм', 1)]
['строка 1: text', 'строка 2: label', 'строка 3: label']
```

Разберём:

- `Sample.model_validate(row)` — создание модели из словаря (то же, что `Sample(**row)`, но удобнее для данных извне);
- пустой после обрезки текст не прошёл `min_length=1` — пробелы убрал `str_strip_whitespace`;
- метка `"0"` (строка) отвергнута, хотя `int`-поле приняло бы её: для `Literal` Pydantic требует **точное** значение — строка `"0"` не равна числу `0`. Это осознанная строгость: литералы сравниваются как есть;
- метка `5` не входит в `Literal[0, 1]`.

Вместо двадцати строк проверок — декларативное описание того, какими должны быть данные. Проверки, сообщения об ошибках и преобразования Pydantic берёт на себя.

## Попробуйте сами

- Добавьте в `TrainingConfig` поле `optimizer: Literal["adam", "sgd"] = "adam"` и попробуйте создать конфигурацию с `"adamw"`.
- Напишите модель `User` с полем `email: str` и `@field_validator`, который проверяет наличие `@` и приводит адрес к нижнему регистру.
- Сравните `Settings(model="mini", temprature=0.5)` с `extra="forbid"` и без этой настройки.

## Частые ошибки

**1. Забытый `@classmethod` под `@field_validator`.** Валидатор поля — метод класса; порядок декораторов: сначала `@field_validator(...)`, под ним `@classmethod`.

**2. Валидатор, который ничего не возвращает.** Без `return value` поле станет `None`. Валидатор всегда возвращает итоговое значение (`model_validator(mode="after")` — `self`).

**3. Опечатки в именах полей проходят незаметно.** По умолчанию лишние ключи игнорируются: `temprature=0.5` просто пропадёт. Для конфигураций включайте `extra="forbid"`.

**4. Ожидание строгой типизации по умолчанию.** `"5"` для `int` — допустимо (преобразуется). Если это нежелательно — `strict=True` или типы `StrictInt`.

**5. Печать `str(error)` в тестах и сравнениях.** Текст ошибки содержит ссылку на документацию с номером версии и меняется между версиями. Для логики используйте `error.errors()` — поля `loc` и `type`.

**6. Валидация в каждой функции заново.** Проверяйте данные **один раз** на границе программы (при загрузке), а дальше передавайте модель — её корректность уже гарантирована.

## Где это в AI-инженерии

- **FastAPI** (часть 8): тело запроса описывается Pydantic-моделью; некорректный запрос автоматически получает ответ 422 со списком ошибок — тем самым `errors()`.
- **Конфигурации экспериментов**: модель настроек с ограничениями ловит `learning_rate=-1` или опечатку в ключе до запуска многочасового обучения (мини-проект блока).
- **SDK OpenAI и Anthropic** описывают ответы API Pydantic-моделями: `response.usage.input_tokens` — атрибут модели, а не ключ словаря.
- **Structured output**: модель Pydantic задаёт схему ответа LLM, а валидация проверяет, что модель ответила в нужном формате (урок 6).
- **pydantic-settings**: чтение настроек сервиса из переменных окружения и `.env`-файлов с проверкой типов (проект части 2).

## Итоги урока

- `class M(BaseModel)` с полями-аннотациями: при создании данные проверяются и приводятся к типам.
- Ошибки — `ValidationError` со списком `errors()` (`loc`, `type`, `msg`) — сразу все проблемы.
- `Field(gt=..., le=..., min_length=..., pattern=..., default=...)` — ограничения полей.
- `Literal`, `Enum`, вложенные модели и списки моделей проверяются рекурсивно.
- `@field_validator` (+ `@classmethod`) и `@model_validator(mode="after")` — свои проверки через `raise ValueError`.
- `model_validate`, `model_dump`, `model_copy`; `ConfigDict(extra="forbid", str_strip_whitespace=True, frozen=True)`.
