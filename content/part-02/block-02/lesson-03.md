# dataclasses

## Проблема: шаблонный код

Многие классы — это просто «контейнеры данных» с несколькими полями: точка, сообщение, результат эксперимента, настройки. Посмотрите, сколько кода нужно, чтобы такой класс был удобным:

```python norun
class Experiment:
    def __init__(self, name, model, accuracy, epochs=10):
        self.name = name
        self.model = model
        self.accuracy = accuracy
        self.epochs = epochs

    def __repr__(self):
        return (f"Experiment(name={self.name!r}, model={self.model!r}, "
                f"accuracy={self.accuracy!r}, epochs={self.epochs!r})")

    def __eq__(self, other):
        if not isinstance(other, Experiment):
            return NotImplemented
        return (self.name, self.model, self.accuracy, self.epochs) == (
            other.name, other.model, other.accuracy, other.epochs)
```

Каждое поле упоминается **пять раз**. Добавили поле — нужно не забыть дописать его в четыре места; забыли в `__eq__` — получили тонкий баг. Такой повторяющийся код называют шаблонным (boilerplate).

Модуль `dataclasses` из стандартной библиотеки генерирует всё это автоматически.

## @dataclass

```python
from dataclasses import dataclass


@dataclass
class Experiment:
    name: str
    model: str
    accuracy: float
    epochs: int = 10


exp = Experiment("baseline", "logreg", 0.84)
print(exp)
print(exp == Experiment("baseline", "logreg", 0.84))
print(exp.epochs)
exp.accuracy = 0.86
print(exp.accuracy)
```

```text
Experiment(name='baseline', model='logreg', accuracy=0.84, epochs=10)
True
10
0.86
```

Декоратор `@dataclass` читает **поля**, объявленные в теле класса, и создаёт:

- `__init__` с параметрами в порядке объявления (с умолчаниями, если они заданы);
- `__repr__`, показывающий все поля;
- `__eq__`, сравнивающий поля по порядку (объекты одного класса).

Объект датакласса — обычный объект: можно менять атрибуты, добавлять методы и свойства.

### Аннотации типов

Запись `name: str` — это **аннотация типа**: подсказка, какого типа значение ожидается. Для `@dataclass` аннотация обязательна — именно по ней декоратор узнаёт, что это поле. Важно понимать: **Python не проверяет типы** во время выполнения. `Experiment(name=42, model=None, accuracy="высокая")` создастся без ошибок. Аннотации читают редактор, линтеры и анализаторы вроде mypy. Подробно о типизации — в блоке 2.5, а проверку типов во время выполнения даёт Pydantic.

Атрибут **без аннотации** в теле класса (`VERSION = 2`) — обычный атрибут класса, полем он не станет.

## Значения по умолчанию

Поля с умолчаниями должны идти **после** полей без них — по тем же правилам, что параметры функции:

```python
from dataclasses import dataclass


@dataclass
class Message:
    role: str
    content: str
    tokens: int = 0
    pinned: bool = False


print(Message("user", "Привет"))
print(Message("assistant", "Здравствуйте", tokens=3))
```

```text
Message(role='user', content='Привет', tokens=0, pinned=False)
Message(role='assistant', content='Здравствуйте', tokens=3, pinned=False)
```

### Изменяемые умолчания: field(default_factory=...)

Вспомните ловушку с изменяемыми значениями по умолчанию (блок 1.6 и урок 2 блока 2.1). Датаклассы защищают от неё — список как умолчание вызывает ошибку уже при объявлении класса:

```python
from dataclasses import dataclass

try:
    @dataclass
    class Chat:
        title: str
        messages: list = []
except ValueError as error:
    print(error)
```

```text
mutable default <class 'list'> for field messages is not allowed: use default_factory
```

Правильный способ — `field(default_factory=list)`: функция `list` будет вызываться для **каждого** нового объекта, давая ему свой пустой список:

```python
from dataclasses import dataclass, field


@dataclass
class Chat:
    title: str
    messages: list = field(default_factory=list)
    settings: dict = field(default_factory=lambda: {"temperature": 0.7})


first = Chat("Работа")
second = Chat("Дом")
first.messages.append("отчёт готов?")
print(first.messages, second.messages)
print(second.settings)
```

```text
['отчёт готов?'] []
{'temperature': 0.7}
```

`default_factory` принимает любую функцию без аргументов: `list`, `dict`, `set` или `lambda`, возвращающую нужное начальное значение.

## Настройка полей: field()

Функция `field()` позволяет тонко настроить отдельное поле:

```python
from dataclasses import dataclass, field


@dataclass
class ApiClient:
    base_url: str
    api_key: str = field(repr=False)
    timeout: float = 30.0
    request_count: int = field(default=0, init=False, compare=False)


client = ApiClient("https://api.example.com", "sk-secret")
client.request_count += 1
print(client)
print(client == ApiClient("https://api.example.com", "sk-secret"))
```

```text
ApiClient(base_url='https://api.example.com', timeout=30.0, request_count=1)
True
```

- `repr=False` — поле не попадает в `__repr__` (ключ API не утечёт в логи);
- `init=False` — поля нет среди параметров `__init__`, оно получает значение по умолчанию;
- `compare=False` — поле не участвует в `__eq__` (счётчик запросов не влияет на равенство клиентов).

## __post_init__: проверка и вычисляемые поля

Сгенерированный `__init__` только присваивает значения. Чтобы проверить их или вычислить производное поле, определите метод `__post_init__` — он вызывается сразу после `__init__`:

```python
from dataclasses import dataclass, field


@dataclass
class Split:
    train: int
    test: int
    total: int = field(init=False)

    def __post_init__(self):
        if self.train < 0 or self.test < 0:
            raise ValueError("размеры выборок не могут быть отрицательными")
        self.total = self.train + self.test

    @property
    def test_ratio(self):
        return self.test / self.total


split = Split(800, 200)
print(split, split.test_ratio)
try:
    Split(-1, 10)
except ValueError as error:
    print(error)
```

```text
Split(train=800, test=200, total=1000) 0.2
размеры выборок не могут быть отрицательными
```

Обратите внимание: свойство `test_ratio` объявлено через `@property` и не имеет аннотации — поэтому полем оно не стало. Датаклассы прекрасно сочетаются с обычными методами и свойствами.

## frozen=True: неизменяемые объекты

`@dataclass(frozen=True)` запрещает менять поля после создания. Бонус: такие объекты автоматически получают `__hash__`, и их можно класть в множества и использовать как ключи словаря:

```python
from dataclasses import dataclass, FrozenInstanceError


@dataclass(frozen=True)
class Point:
    x: float
    y: float


p = Point(1, 2)
try:
    p.x = 10
except FrozenInstanceError as error:
    print("Нельзя:", error)
print(len({Point(1, 2), Point(1, 2), Point(0, 0)}))
distances = {Point(0, 0): 0.0}
print(distances[Point(0, 0)])
```

```text
Нельзя: cannot assign to field 'x'
2
0.0
```

Неизменяемые объекты безопаснее: их можно спокойно передавать в любые функции, не боясь, что их изменят. Для «значений» — точек, денежных сумм, координат, ключей кэша — используйте `frozen=True`.

Как «изменить» замороженный объект? Создать новый с изменённым полем через `dataclasses.replace`:

```python
from dataclasses import dataclass, replace


@dataclass(frozen=True)
class Config:
    model: str
    lr: float = 0.001
    epochs: int = 10


base = Config("bert")
fast = replace(base, lr=0.01, epochs=3)
print(base)
print(fast)
```

```text
Config(model='bert', lr=0.001, epochs=10)
Config(model='bert', lr=0.01, epochs=3)
```

## order=True, asdict и astuple

`@dataclass(order=True)` генерирует `<`, `<=`, `>`, `>=`, сравнивая поля **по порядку объявления**, как кортежи. Функции `asdict` и `astuple` превращают объект в словарь и кортеж — удобно для JSON и CSV:

```python
import json
from dataclasses import dataclass, asdict, astuple


@dataclass(order=True)
class Result:
    accuracy: float
    model: str


results = [Result(0.84, "logreg"), Result(0.91, "bert"), Result(0.88, "forest")]
best = max(results)
print(best)
print(sorted(results)[0].model)
print(json.dumps(asdict(best)))
print(astuple(best))
```

```text
Result(accuracy=0.91, model='bert')
logreg
{"accuracy": 0.91, "model": "bert"}
(0.91, 'bert')
```

Поскольку сравнение идёт по порядку полей, первым поставлено `accuracy` — по нему и упорядочиваются результаты. Если порядок полей не совпадает с нужным порядком сортировки, лучше использовать `sorted(..., key=...)`.

`asdict` работает рекурсивно: вложенные датаклассы тоже превращаются в словари.

## Наследование датаклассов

Датакласс можно наследовать — поля потомка добавляются после полей родителя:

```python
from dataclasses import dataclass


@dataclass
class Event:
    name: str
    timestamp: float


@dataclass
class ErrorEvent(Event):
    message: str
    code: int = 500


print(ErrorEvent("api_call", 1700000000.0, "timeout"))
```

```text
ErrorEvent(name='api_call', timestamp=1700000000.0, message='timeout', code=500)
```

Помните правило: если у родителя есть поле со значением по умолчанию, все поля потомка тоже должны иметь умолчания (иначе получится параметр без умолчания после параметра с умолчанием).

## Датакласс или обычный класс?

Датаклассы не заменяют обычные классы полностью — у каждого инструмента своя область.

Датакласс хорош, когда класс в первую очередь **хранит данные**: набор полей, которые важно видеть в отладке, сравнивать и сохранять. Конфигурации, сообщения, результаты, записи из файла, ответы API — всё это естественные датаклассы. Методы у них тоже бывают, но они работают с полями и не скрывают сложного внутреннего состояния.

Обычный класс уместнее, когда главное в объекте — **поведение**, а его внутреннее устройство нужно спрятать: соединение с базой данных, клиент API со счётчиками и кэшем, модель с обучаемыми параметрами. Автоматический `__init__` с полями-параметрами и `__repr__`, показывающий всё подряд, здесь скорее мешают: внешнему коду незачем видеть и задавать внутренние атрибуты.

Полезный признак: если вы пишете датакласс, а затем почти все поля объявляете с `init=False` и `repr=False`, — скорее всего, нужен обычный класс. И наоборот: если в обычном классе `__init__` только переписывает параметры в атрибуты, а `__repr__` и `__eq__` повторяют список полей, — это датакласс, написанный вручную.

## Разбор задачи: журнал экспериментов

Соберём всё вместе: замороженная конфигурация, результат с проверкой в `__post_init__` и журнал, который находит лучший запуск и экспортирует результаты.

```python
import json
from dataclasses import dataclass, field, asdict


@dataclass(frozen=True)
class RunConfig:
    model: str
    lr: float = 0.001
    batch_size: int = 32


@dataclass
class RunResult:
    config: RunConfig
    accuracy: float
    notes: list = field(default_factory=list)

    def __post_init__(self):
        if not 0 <= self.accuracy <= 1:
            raise ValueError(f"accuracy вне [0, 1]: {self.accuracy}")


@dataclass
class ExperimentLog:
    runs: list = field(default_factory=list)

    def add(self, config, accuracy, *notes):
        result = RunResult(config, accuracy, list(notes))
        self.runs.append(result)
        return result

    def best(self):
        return max(self.runs, key=lambda run: run.accuracy)

    def to_json(self):
        return json.dumps([asdict(run) for run in self.runs], ensure_ascii=False)


log = ExperimentLog()
log.add(RunConfig("logreg"), 0.84)
log.add(RunConfig("bert", lr=0.0001), 0.91, "долго учится")
print(log.best().config)
print(log.to_json())
print(len({run.config for run in log.runs}))
```

```text
RunConfig(model='bert', lr=0.0001, batch_size=32)
[{"config": {"model": "logreg", "lr": 0.001, "batch_size": 32}, "accuracy": 0.84, "notes": []}, {"config": {"model": "bert", "lr": 0.0001, "batch_size": 32}, "accuracy": 0.91, "notes": ["долго учится"]}]
2
```

Что дали датаклассы: ни одного написанного вручную `__init__`, `__repr__` или `__eq__`; конфигурации неизменяемые и хешируемые (их можно собрать во множество, чтобы найти уникальные); `asdict` рекурсивно превратил вложенную конфигурацию в словарь для JSON.

## Попробуйте сами

- Добавьте в `Experiment` поле `tags: list` с пустым списком по умолчанию.
- Сделайте `Point` из примера `frozen` и добавьте метод `distance_to(other)`.
- Поменяйте порядок полей в `Result` (сначала `model`) и посмотрите, что вернёт `max(results)`.

## Частые ошибки

**1. Поле без аннотации.** `name = "x"` вместо `name: str = "x"` — это атрибут класса, а не поле: его не будет в `__init__` и `__repr__`.

**2. Изменяемое умолчание.** `messages: list = []` → `ValueError` при объявлении. Используйте `field(default_factory=list)`.

**3. Поле без умолчания после поля с умолчанием.** `TypeError: non-default argument 'x' follows default argument`. Переставьте поля.

**4. Ожидание проверки типов.** `name: str` не мешает передать число. Проверяйте значения в `__post_init__` или используйте Pydantic (блок 2.5).

**5. Изменение `frozen`-объекта.** `FrozenInstanceError`. Создавайте копию через `replace(obj, field=value)`.

**6. `order=True` с неудачным порядком полей.** Сортировка идёт по первому полю, потом по второму. Если первым стоит `name`, результаты отсортируются по алфавиту, а не по метрике.

## Где это в AI-инженерии

- **Hugging Face** описывает аргументы обучения датаклассами: `TrainingArguments` — это `@dataclass` с десятками полей и значениями по умолчанию.
- **Конфигурации экспериментов**: frozen-датаклассы гарантируют, что параметры не изменятся во время обучения, и их легко сохранить через `asdict` вместе с результатами.
- **Сообщения диалога, документы для RAG, результаты поиска** — типичные датаклассы: `Document(text, metadata, score)`.
- **Структурированные результаты оценки**: `EvalResult(model, metric, value)` с `order=True` для выбора лучшего.
- **Pydantic** (блок 2.5) использует тот же синтаксис полей с аннотациями, но добавляет проверку типов и разбор JSON — переход с датаклассов на Pydantic почти бесшовный.

## Итоги урока

- `@dataclass` генерирует `__init__`, `__repr__` и `__eq__` по полям с аннотациями.
- Изменяемые умолчания — только через `field(default_factory=...)`.
- `field()` настраивает поле: `repr=False`, `init=False`, `compare=False`.
- `__post_init__` — для проверок и вычисляемых полей.
- `frozen=True` — неизменяемые и хешируемые объекты; копия с изменениями — `replace()`.
- `order=True` — сравнения по порядку полей; `asdict`/`astuple` — для экспорта.
