# Композиция против наследования

## Два способа переиспользовать код

У вас есть класс, который уже что-то умеет, и вы хотите использовать это в новом классе. Есть два пути:

- **Наследование** — новый класс **является** разновидностью старого: `class SavingsAccount(Account)`. Он получает все методы родителя.
- **Композиция** — новый класс **содержит** объект старого класса в атрибуте и обращается к нему: `self.engine = Engine()`. Новый класс «имеет» старый как составную часть.

В блоке 2.1 вы уже слышали правило «является → наследование, имеет → композиция». В этом уроке разберёмся, почему опытные разработчики говорят **«предпочитайте композицию наследованию»** (favor composition over inheritance) и как это выглядит на практике.

## Взрыв подклассов

Начнём с проблемы. Нужен логгер, который умеет писать в разные места (консоль, файл) и в разных форматах (простой текст, JSON). Сделаем на наследовании:

```python norun
class Logger: ...
class ConsoleLogger(Logger): ...
class FileLogger(Logger): ...
class JsonConsoleLogger(ConsoleLogger): ...
class JsonFileLogger(FileLogger): ...
```

Появляется третье измерение — фильтр по уровню важности? Ещё вдвое больше классов: `FilteredJsonFileLogger`... Каждое новое измерение **умножает** число классов, а код форматирования JSON дублируется в двух ветках иерархии. Это называют комбинаторным взрывом подклассов.

С композицией каждое измерение — отдельный маленький объект, а логгер собирается из них:

```python
import json


class PlainFormatter:
    def format(self, level, message):
        return f"[{level}] {message}"


class JsonFormatter:
    def format(self, level, message):
        return json.dumps({"level": level, "message": message}, ensure_ascii=False)


class ListOutput:
    def __init__(self):
        self.lines = []

    def write(self, line):
        self.lines.append(line)


class PrintOutput:
    def write(self, line):
        print(line)


class Logger:
    def __init__(self, formatter, output):
        self.formatter = formatter
        self.output = output

    def log(self, level, message):
        self.output.write(self.formatter.format(level, message))


Logger(PlainFormatter(), PrintOutput()).log("INFO", "сервер запущен")
Logger(JsonFormatter(), PrintOutput()).log("ERROR", "нет соединения")
memory = ListOutput()
Logger(JsonFormatter(), memory).log("DEBUG", "x=1")
print(memory.lines)
```

```text
[INFO] сервер запущен
{"level": "ERROR", "message": "нет соединения"}
['{"level": "DEBUG", "message": "x=1"}']
```

Два форматтера и два вывода дают четыре комбинации, а классов — пять, и ни одной строки дублирования. Новый формат — один новый класс, и он сразу работает со всеми выводами. Комбинации собираются **во время выполнения**, а не фиксируются иерархией классов.

## Проблемы наследования

Кроме взрыва подклассов, у наследования есть и другие подводные камни.

**Сильная связанность.** Потомок зависит от деталей реализации родителя. Если родитель меняет внутренний метод, который переопределил потомок, поведение может сломаться неожиданно — это называют проблемой «хрупкого базового класса».

**Ненужный интерфейс.** Потомок наследует **все** публичные методы родителя, даже ненужные и опасные. Классический пример:

```python
class Stack(list):
    def push(self, item):
        self.append(item)


stack = Stack()
stack.push(1)
stack.push(2)
stack.insert(0, 99)
stack.sort(reverse=True)
print(stack)
```

```text
[99, 2, 1]
```

Стек должен позволять класть и снимать элементы только сверху. Но, унаследовав `list`, он получил `insert`, `sort`, `remove` и всё остальное — инвариант стека нарушается одной строкой. С композицией наружу выходит только то, что вы решили показать:

```python
class Stack:
    def __init__(self):
        self._items = []

    def push(self, item):
        self._items.append(item)

    def pop(self):
        if not self._items:
            raise IndexError("стек пуст")
        return self._items.pop()

    def __len__(self):
        return len(self._items)


stack = Stack()
stack.push(1)
stack.push(2)
print(stack.pop(), len(stack))
print(hasattr(stack, "insert"))
```

```text
2 1
False
```

**Жёсткость.** Родитель выбирается при написании кода и не может поменяться во время работы. А объект-компонент можно заменить в любой момент: `logger.formatter = JsonFormatter()`.

## Делегирование

При композиции внешний объект **делегирует** работу внутреннему: метод внешнего класса вызывает метод компонента. Часто делегирующие методы очень короткие — в одну строку:

```python
class Engine:
    def __init__(self, power):
        self.power = power
        self.running = False

    def start(self):
        self.running = True
        return f"двигатель {self.power} л.с. запущен"


class Car:
    def __init__(self, model, power):
        self.model = model
        self.engine = Engine(power)

    def start(self):
        return f"{self.model}: {self.engine.start()}"

    @property
    def is_running(self):
        return self.engine.running


car = Car("Лада", 106)
print(car.start())
print(car.is_running)
```

```text
Лада: двигатель 106 л.с. запущен
True
```

Автомобиль не является двигателем, он **имеет** двигатель. Внешний код общается с `Car`, а `Car` сам решает, какие возможности двигателя показать и в каком виде.

## Стратегия: поведение как параметр

Особенно полезный приём композиции — паттерн **«Стратегия»**: изменяемая часть поведения выносится в отдельный объект (или функцию), который передаётся снаружи. В Python функции — тоже объекты, поэтому стратегией может быть и простая функция:

```python
def by_length(texts):
    return sorted(texts, key=len)


def alphabetical(texts):
    return sorted(texts, key=str.lower)


class Ranker:
    def __init__(self, strategy=alphabetical):
        self.strategy = strategy

    def rank(self, texts):
        return self.strategy(texts)


texts = ["Python", "ML", "нейросеть", "AI"]
print(Ranker().rank(texts))
print(Ranker(by_length).rank(texts))
ranker = Ranker()
ranker.strategy = lambda items: list(reversed(items))
print(ranker.rank(texts))
```

```text
['AI', 'ML', 'Python', 'нейросеть']
['ML', 'AI', 'Python', 'нейросеть']
['AI', 'нейросеть', 'ML', 'Python']
```

Без стратегии понадобились бы подклассы `LengthRanker`, `AlphabeticalRanker`... Со стратегией один класс `Ranker`, а способов ранжирования — сколько угодно, включая придуманные на лету. О функциях как объектах подробно — в блоке 2.4.

## Автоматическое делегирование: __getattr__

Если обёртка должна пропускать к компоненту **все** атрибуты, кроме нескольких, писать десятки однострочных методов утомительно. Специальный метод `__getattr__` вызывается, только когда атрибут **не найден** обычным способом, — и может перенаправить запрос компоненту:

```python
class CountingWrapper:
    def __init__(self, target):
        self._target = target
        self.calls = {}

    def __getattr__(self, name):
        attribute = getattr(self._target, name)
        self.calls[name] = self.calls.get(name, 0) + 1
        return attribute


items = CountingWrapper(["b", "a", "c"])
print(items.index("a"))
print(items.count("c"))
print(items.index("c"))
print(items.calls)
```

```text
1
1
2
{'index': 2, 'count': 1}
```

У `CountingWrapper` нет методов `index` и `count`, поэтому срабатывает `__getattr__`, который берёт атрибут у обёрнутого списка и заодно считает обращения. Этот приём используется в прокси-объектах, кэширующих и логирующих обёртках. Пользуйтесь им умеренно: код с автоматическим делегированием сложнее читать, а редактор не может подсказать доступные методы.

## Когда наследование всё-таки уместно

Композиция — не догма. Наследование хорошо, когда:

- отношение действительно «является», и потомок полностью заменяет родителя везде (принцип подстановки);
- фреймворк ожидает наследования: `nn.Module` в PyTorch, `Exception` для своих исключений, `ABC` для интерфейсов;
- иерархия неглубокая (1–2 уровня), а базовый класс спроектирован для расширения (шаблонный метод, абстрактные методы).

Тревожные признаки неудачного наследования: иерархия глубже трёх уровней; потомок переопределяет методы родителя так, чтобы они «ничего не делали» или бросали ошибку; наследование от `list`/`dict` ради пары методов; классы-комбинации вида `JsonFileFilteredLogger`.

## Разбор задачи: агент из компонентов

LLM-агент — хороший пример композиции. Агенту нужны языковая модель, память (история диалога) и набор инструментов. Каждая часть может меняться независимо: другая модель, память с ограничением длины, новые инструменты. Наследованием такую систему не построить без взрыва подклассов.

```python
class ScriptedModel:
    def __init__(self, replies):
        self._replies = list(replies)

    def generate(self, messages):
        return self._replies.pop(0)


class WindowMemory:
    def __init__(self, size):
        self.size = size
        self._messages = []

    def add(self, role, content):
        self._messages.append({"role": role, "content": content})
        self._messages = self._messages[-self.size:]

    def messages(self):
        return list(self._messages)


class Calculator:
    name = "calc"

    def run(self, expression):
        left, right = expression.split("+")
        return str(int(left) + int(right))


class Agent:
    def __init__(self, model, memory, tools):
        self.model = model
        self.memory = memory
        self.tools = {tool.name: tool for tool in tools}

    def ask(self, question):
        self.memory.add("user", question)
        reply = self.model.generate(self.memory.messages())
        if reply.startswith("TOOL "):
            _, name, argument = reply.split(" ", 2)
            reply = f"Результат {name}: {self.tools[name].run(argument)}"
        self.memory.add("assistant", reply)
        return reply


agent = Agent(
    model=ScriptedModel(["Привет! Чем помочь?", "TOOL calc 2+40"]),
    memory=WindowMemory(size=3),
    tools=[Calculator()],
)
print(agent.ask("Привет"))
print(agent.ask("Сколько будет 2+40?"))
print(len(agent.memory.messages()))
```

```text
Привет! Чем помочь?
Результат calc: 42
3
```

`Agent` ничего не знает о том, как устроены модель, память и инструменты, — только их интерфейсы (`generate`, `add`/`messages`, `name`/`run`). Поэтому:

- в тестах подставлена `ScriptedModel`, в продакшене — клиент API;
- `WindowMemory(size=3)` легко заменить на память с подсчётом токенов или с сохранением в базу;
- новый инструмент — новый маленький класс, `Agent` не меняется.

Так устроены реальные фреймворки для агентов: агент собирается из модели, памяти, инструментов и стратегии планирования.

## Попробуйте сами

- Добавьте форматтер `TimestampFormatter`, который добавляет к строке номер записи, и соберите с ним логгер.
- Добавьте в `Stack` метод `peek()` — посмотреть верхний элемент, не снимая.
- Напишите инструмент `Upper` для агента и сценарий модели, который его вызывает.

## Частые ошибки

**1. Наследование ради переиспользования пары методов.** `class Config(dict)` или `class History(list)` тянут чужой интерфейс целиком. Храните словарь или список в атрибуте.

**2. Глубокие иерархии.** Пять уровней наследования — почти всегда признак того, что части поведения стоило вынести в компоненты.

**3. Создание компонентов внутри класса.** `self.model = OpenAIClient()` в `__init__` лишает гибкости и тестируемости. Передавайте компоненты параметрами (с разумными умолчаниями).

**4. Утечка внутреннего компонента.** Если внешний код начинает писать `car.engine.cylinders[2].valve...`, инкапсуляция нарушена: добавьте методы в `Car` или пересмотрите разбиение.

**5. Злоупотребление `__getattr__`.** Делегирование «всего подряд» скрывает интерфейс класса и опечатки: обращение к несуществующему атрибуту даст ошибку из глубины компонента.

**6. Бесконечная рекурсия в `__getattr__`.** Если внутри обращаться к атрибуту, который ещё не создан (например, `self._target` до `__init__`), `__getattr__` будет вызывать сам себя.

## Где это в AI-инженерии

- **Модели PyTorch** — композиция слоёв: модель содержит `self.encoder`, `self.classifier`, а не наследует их. Наследование — только от `nn.Module`, потому что этого требует фреймворк.
- **scikit-learn Pipeline** — композиция шагов: `Pipeline([("scale", StandardScaler()), ("model", LogisticRegression())])`.
- **Агенты** собираются из модели, памяти, инструментов и ретривера — каждая часть заменяема.
- **Стратегии**: функции потерь, оптимизаторы, метрики и стратегии чанкинга передаются как параметры, а не зашиваются в подклассы.
- **Обёртки над клиентами API**: кэширующие, логирующие, ограничивающие частоту запросов — делегируют основной работе клиента.

## Итоги урока

- Наследование — «является», композиция — «имеет»; предпочитайте композицию.
- Композиция избавляет от взрыва подклассов: измерения поведения комбинируются во время выполнения.
- Наследование от встроенных коллекций открывает лишний интерфейс и ломает инварианты.
- Делегирование: внешний объект вызывает методы компонента; `__getattr__` автоматизирует его, но снижает читаемость.
- Стратегия — изменяемое поведение как параметр (объект или функция).
- Наследование уместно для настоящего «является», неглубоких иерархий и когда его требует фреймворк.
