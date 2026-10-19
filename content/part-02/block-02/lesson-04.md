# Абстрактные классы (abc) и протоколы

## Проблема: ошибка слишком поздно

В блоке 2.1 базовый класс сообщал «потомок обязан переопределить этот метод» так:

```python
class Exporter:
    def export(self, rows):
        raise NotImplementedError


class CsvExporter(Exporter):
    def exprot(self, rows):          # опечатка в имени!
        return "csv"


exporter = CsvExporter()             # создаётся без ошибок
print("объект создан")
try:
    exporter.export([])
except NotImplementedError:
    print("ошибка только при вызове")
```

```text
объект создан
ошибка только при вызове
```

Объект с «дырой» создан успешно, и ошибка всплывёт, только когда кто-то вызовет `export` — может быть, через час работы программы или только у клиента. Хочется узнавать о проблеме **при создании объекта**, а ещё лучше — при написании кода. Для этого есть абстрактные классы и протоколы.

## Абстрактный базовый класс

**Абстрактный класс** — класс, который описывает интерфейс, но сам не предназначен для создания объектов. Модуль `abc` (Abstract Base Classes) даёт для этого базовый класс `ABC` и декоратор `@abstractmethod`:

```python
from abc import ABC, abstractmethod


class Exporter(ABC):
    @abstractmethod
    def export(self, rows):
        """Превратить строки в текст нужного формата."""


class CsvExporter(Exporter):
    def exprot(self, rows):
        return "csv"


try:
    CsvExporter()
except TypeError as error:
    print(error)
try:
    Exporter()
except TypeError as error:
    print(error)
```

```text
Can't instantiate abstract class CsvExporter without an implementation for abstract method 'export'
Can't instantiate abstract class Exporter without an implementation for abstract method 'export'
```

Правила простые:

- класс наследует `ABC`, а обязательные методы помечены `@abstractmethod`;
- объект **нельзя создать**, пока в классе остаётся хоть один нереализованный абстрактный метод;
- потомок, переопределивший все абстрактные методы, становится **конкретным** классом — его объекты создаются как обычно.

Теперь опечатка `exprot` обнаруживается в момент `CsvExporter()`, а не в момент вызова метода. Тело абстрактного метода обычно содержит только docstring — он описывает, что должен делать метод.

## Общий код в абстрактном классе

Абстрактный класс может содержать и обычные методы. Это сочетается с шаблонным методом из урока 2.1.4: общий алгоритм — в базовом классе, обязательные шаги — абстрактные:

```python
from abc import ABC, abstractmethod


class Exporter(ABC):
    extension = "txt"

    @abstractmethod
    def export(self, rows):
        """Превратить строки в текст."""

    def filename(self, name):
        return f"{name}.{self.extension}"

    def save_preview(self, name, rows):
        text = self.export(rows)
        return f"{self.filename(name)}: {len(text)} символов"


class CsvExporter(Exporter):
    extension = "csv"

    def export(self, rows):
        header = ",".join(rows[0])
        lines = [",".join(str(row[key]) for key in rows[0]) for row in rows]
        return "\n".join([header, *lines])


rows = [{"model": "bert", "f1": 0.91}, {"model": "logreg", "f1": 0.84}]
exporter = CsvExporter()
print(exporter.export(rows))
print(exporter.save_preview("results", rows))
```

```text
model,f1
bert,0.91
logreg,0.84
results.csv: 30 символов
```

`CsvExporter` реализовал только `export` и получил `filename` и `save_preview` по наследству.

## Абстрактные свойства

`@abstractmethod` сочетается с `@property` — так можно потребовать, чтобы у потомка было свойство. Порядок декораторов важен: `@property` сверху, `@abstractmethod` снизу.

```python
from abc import ABC, abstractmethod


class Model(ABC):
    @property
    @abstractmethod
    def name(self):
        """Имя модели."""

    @abstractmethod
    def predict(self, x):
        """Предсказание для одного объекта."""

    def describe(self):
        return f"Модель {self.name}"


class Threshold(Model):
    def __init__(self, threshold):
        self.threshold = threshold

    @property
    def name(self):
        return f"threshold>{self.threshold}"

    def predict(self, x):
        return int(x > self.threshold)


model = Threshold(0.5)
print(model.describe(), [model.predict(x) for x in (0.2, 0.7)])
print(isinstance(model, Model))
```

```text
Модель threshold>0.5 [0, 1]
True
```

## Абстрактные классы стандартной библиотеки

Модуль `collections.abc` содержит абстрактные классы для протоколов коллекций: `Sized` (есть `__len__`), `Iterable` (можно перебирать), `Sequence`, `Mapping` и другие. Ими удобно проверять «умения» объекта:

```python
from collections.abc import Mapping, Sequence, Sized

for value in ([1, 2], "abc", {"a": 1}, 42):
    print(type(value).__name__, isinstance(value, Sized), isinstance(value, Sequence), isinstance(value, Mapping))
```

```text
list True True False
str True True False
dict True False True
int False False False
```

А если унаследовать свой класс от `Sequence`, достаточно реализовать два абстрактных метода — `__getitem__` и `__len__` — и получить в подарок `in`, перебор, `reversed`, `.index()` и `.count()`. Абстрактный класс здесь работает как **миксин** с готовыми методами:

```python
from collections.abc import Sequence


class Tokens(Sequence):
    def __init__(self, text):
        self._tokens = text.split()

    def __getitem__(self, index):
        return self._tokens[index]

    def __len__(self):
        return len(self._tokens)


tokens = Tokens("to be or not to be")
print(len(tokens), tokens[2], "not" in tokens)
print(tokens.count("be"), tokens.index("not"), list(reversed(tokens))[:2])
```

```text
6 or True
2 3 ['be', 'to']
```

## Протоколы: структурная типизация

Абстрактные классы требуют **наследования**: чтобы считаться экспортёром, класс должен унаследовать `Exporter`. Но в уроке 2.1.5 вы видели утиную типизацию: Python-коду важны методы, а не родословная. Чужой класс из сторонней библиотеки вы не сможете унаследовать от своего ABC — а метод `export` у него может быть.

**Протокол** (`typing.Protocol`) описывает интерфейс **без требования наследования**: объект подходит, если у него есть нужные методы. Это называется **структурной типизацией** — формализованная утиная типизация.

```python
from typing import Protocol


class TextModel(Protocol):
    def generate(self, prompt: str) -> str:
        ...


class EchoModel:
    def generate(self, prompt: str) -> str:
        return prompt


class UpperModel:
    def generate(self, prompt: str) -> str:
        return prompt.upper()


def answer(model: TextModel, question: str) -> str:
    return model.generate(f"Вопрос: {question}")


print(answer(EchoModel(), "что такое протокол?"))
print(answer(UpperModel(), "зачем?"))
```

```text
Вопрос: что такое протокол?
ВОПРОС: ЗАЧЕМ?
```

`EchoModel` и `UpperModel` **не наследуют** `TextModel`, но подходят под протокол. Запись `model: TextModel` — аннотация типа (вы видели их в уроке про dataclasses): она документирует, что функция ожидает «что угодно с методом `generate(prompt: str) -> str`». Тело метода в протоколе — `...` (многоточие, объект `Ellipsis`): реализации нет, только сигнатура.

Во время выполнения Python протокол **не проверяет**. Проверку делает статический анализатор типов (mypy, Pyright) и редактор: если передать в `answer` объект без `generate`, они подсветят ошибку ещё до запуска. Подробно о mypy — в блоке 2.5.

### runtime_checkable

Если нужна проверка через `isinstance`, протокол помечают декоратором `@runtime_checkable`:

```python
from typing import Protocol, runtime_checkable


@runtime_checkable
class Closeable(Protocol):
    def close(self) -> None:
        ...


class Connection:
    def close(self) -> None:
        print("соединение закрыто")


class Report:
    pass


for obj in (Connection(), Report()):
    if isinstance(obj, Closeable):
        obj.close()
    else:
        print(type(obj).__name__, "закрывать не нужно")
```

```text
соединение закрыто
Report закрывать не нужно
```

Ограничение: `isinstance` с протоколом проверяет только **наличие** методов, но не их параметры и типы результата.

## ABC или Protocol?

| | Абстрактный класс (ABC) | Протокол (Protocol) |
|---|---|---|
| Как класс «подходит» | наследует базовый класс | имеет нужные методы |
| Когда ловится ошибка | при создании объекта | статическим анализатором (mypy) |
| Общий код для потомков | да, обычные методы | обычно нет |
| Сторонние классы | нужно наследование | подходят автоматически |
| Типичное применение | иерархия ваших классов с общей логикой | интерфейс зависимости (модель, хранилище, клиент) |

Практическое правило: если вы строите **семейство своих классов с общим кодом** — абстрактный класс. Если описываете, **что нужно вашей функции от аргумента**, — протокол.

## Как проектировать интерфейс

Абстрактный класс или протокол — это договор между тем, кто пишет реализацию, и тем, кто её использует. Хороший договор подчиняется нескольким правилам.

**Минимальность.** Включайте в интерфейс только то, что действительно нужно вызывающему коду. Протокол с десятью методами трудно реализовать, а фейк для теста превращается в отдельный проект. Если функции нужен только `search`, ей не нужен протокол со всеми методами хранилища.

**Стабильность.** Интерфейс меняется редко, реализации — часто. Добавление нового абстрактного метода ломает все существующие подклассы: ни один из них больше не создастся. Поэтому новые возможности часто добавляют обычным методом с реализацией по умолчанию.

**Понятные контракты.** Docstring абстрактного метода — это документация для того, кто будет его реализовывать: что метод принимает, что возвращает, какие исключения бросает. Без неё каждый потомок поймёт задачу по-своему.

**Один уровень абстракции.** Методы интерфейса должны описывать «что», а не «как»: `save(document)`, а не `open_connection()` и `execute_insert_sql()`. Тогда одну и ту же абстракцию сможет реализовать и хранилище в памяти, и база данных.

## Разбор задачи: хранилища документов для RAG

В RAG-системе (блок 7.3) документы хранятся в хранилище: в памяти для тестов, в векторной базе в продакшене. Опишем абстрактное хранилище с общим поиском, а для кода, который только читает документы, — узкий протокол.

```python
from abc import ABC, abstractmethod
from typing import Protocol


class DocumentStore(ABC):
    @abstractmethod
    def add(self, doc_id, text):
        """Сохранить документ."""

    @abstractmethod
    def all_items(self):
        """Вернуть список пар (doc_id, text)."""

    def search(self, query, limit=2):
        words = set(query.lower().split())
        scored = []
        for doc_id, text in self.all_items():
            score = len(words & set(text.lower().split()))
            if score:
                scored.append((score, doc_id))
        scored.sort(key=lambda pair: (-pair[0], pair[1]))
        return [doc_id for _, doc_id in scored[:limit]]


class MemoryStore(DocumentStore):
    def __init__(self):
        self._docs = {}

    def add(self, doc_id, text):
        self._docs[doc_id] = text

    def all_items(self):
        return list(self._docs.items())


class Searcher(Protocol):
    def search(self, query: str, limit: int = 2) -> list:
        ...


def build_context(searcher: Searcher, question: str) -> str:
    found = searcher.search(question)
    return f"Найдено документов: {len(found)} → {', '.join(found)}"


store = MemoryStore()
store.add("py", "Python популярный язык для машинного обучения")
store.add("soup", "Рецепт борща со свёклой")
store.add("ml", "Машинного обучения без данных не бывает")
print(store.search("язык машинного обучения"))
print(build_context(store, "рецепт борща"))
```

```text
['py', 'ml']
Найдено документов: 1 → soup
```

Распределение ролей:

- `DocumentStore` (ABC) задаёт обязательные операции `add` и `all_items` и даёт всем хранилищам общий `search`. Новое хранилище (файл, база данных) реализует два метода — и сразу умеет искать.
- `Searcher` (Protocol) описывает, что нужно функции `build_context`: только метод `search`. Ей подойдёт любое хранилище, а в тестах — простой фейк с методом `search`, без наследования от `DocumentStore`.

## Попробуйте сами

- Создайте класс `JsonExporter(Exporter)` и проверьте, что его объект создаётся, только когда реализован `export`.
- Напишите класс `FakeSearcher` с методом `search`, возвращающим `["test"]`, и передайте его в `build_context`.
- Унаследуйте класс `Playlist` от `collections.abc.Sequence` и проверьте, какие методы появились.

## Частые ошибки

**1. Забыть наследовать `ABC`.** `@abstractmethod` в классе без `ABC` (точнее, без метакласса `ABCMeta`) ничего не запрещает — объект создастся.

**2. Неверный порядок декораторов у абстрактного свойства.** Правильно: `@property`, затем `@abstractmethod` (ближе к функции).

**3. Ожидание проверки протокола во время выполнения.** Без `@runtime_checkable` и `isinstance` Python протокол не проверяет; ошибки ловит mypy или редактор.

**4. `isinstance` с протоколом как полная гарантия.** Проверяется только наличие методов, но не их сигнатура: метод `generate()` без параметров «подойдёт» под протокол.

**5. Абстрактный класс ради одного метода без общего кода.** Если общего кода нет, а нужен только интерфейс для параметра функции, — протокол проще и гибче.

**6. Создание объекта абстрактного класса в тестах.** `Exporter()` → `TypeError`. Для теста создайте небольшой конкретный подкласс.

## Где это в AI-инженерии

- **PyTorch** `Dataset` и `nn.Module` — базовые классы с методами, которые нужно переопределить (`__getitem__`, `forward`).
- **LangChain и LlamaIndex** описывают модели, векторные хранилища, ретриверы и инструменты абстрактными классами: `BaseRetriever`, `VectorStore`, `BaseTool`. Новая интеграция — это реализация нескольких абстрактных методов.
- **Протоколы для зависимостей**: функция ожидает «что-то с `generate`» или «что-то с `embed`» — в продакшене это клиент API, в тестах — фейк.
- **scikit-learn** опирается на неявные протоколы `fit`/`predict`/`transform` — по сути структурная типизация.
- **`collections.abc`** в коде обработки данных: `isinstance(x, Mapping)` вместо `isinstance(x, dict)` принимает любой словарь-подобный объект.

## Итоги урока

- `ABC` + `@abstractmethod` запрещают создавать объекты, пока не реализованы все абстрактные методы — ошибка ловится при создании.
- Абстрактный класс может содержать обычные методы — общий код для всех потомков.
- `collections.abc` даёт готовые абстракции; `Sequence` достраивает `in`, `index`, `count`, перебор по `__getitem__` и `__len__`.
- `typing.Protocol` описывает интерфейс без наследования (структурная типизация); проверяет его mypy, а `@runtime_checkable` позволяет `isinstance`.
- ABC — для семейства своих классов с общим кодом; Protocol — для описания того, что функция ожидает от аргумента.
