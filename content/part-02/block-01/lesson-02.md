# Атрибуты класса и экземпляра, методы

## Два места для данных

В прошлом уроке все данные объекта создавались в `__init__` через `self`. Это **атрибуты экземпляра** — у каждого объекта свои. Но бывают данные, общие для **всех** объектов класса: курс валюты для всех счетов, список допустимых ролей для всех сообщений, счётчик созданных объектов. Хранить копию такого значения в каждом объекте — расточительно и опасно (копии могут разойтись). Для них есть **атрибуты класса**.

```python
class Message:
    allowed_roles = ("system", "user", "assistant")   # атрибут класса

    def __init__(self, role, content):
        self.role = role                              # атрибуты экземпляра
        self.content = content


first = Message("user", "Привет")
second = Message("assistant", "Здравствуйте")
print(Message.allowed_roles)
print(first.allowed_roles is second.allowed_roles)
print(first.role, second.role)
```

```text
('system', 'user', 'assistant')
True
user assistant
```

- **Атрибут класса** объявляется прямо в теле класса, вне методов. Он один на всех и доступен и через класс (`Message.allowed_roles`), и через любой объект (`first.allowed_roles`).
- **Атрибут экземпляра** создаётся через `self.имя = ...` и принадлежит конкретному объекту.

## Как Python ищет атрибут

Когда вы пишете `obj.name`, Python ищет `name` по порядку:

1. в атрибутах **самого объекта**;
2. если нет — в атрибутах **его класса**;
3. если нет и там — в родительских классах (урок 4);
4. если нигде нет — `AttributeError`.

Увидеть «содержимое» объекта можно через `vars(obj)` (или `obj.__dict__`) — это словарь его атрибутов экземпляра:

```python
class Config:
    model = "mini"
    temperature = 0.7

    def __init__(self, name):
        self.name = name


config = Config("эксперимент-1")
print(vars(config))
print(config.model)
print("model" in vars(config))
```

```text
{'name': 'эксперимент-1'}
mini
False
```

У объекта `config` в словаре только `name`. Атрибут `model` найден на втором шаге — в классе.

## Затенение: присваивание через объект

Чтение через объект находит атрибут класса, а вот **присваивание** через объект всегда создаёт (или меняет) атрибут **экземпляра**. Атрибут класса при этом не меняется — он просто «затеняется» для этого объекта:

```python
class Config:
    temperature = 0.7


a = Config()
b = Config()
a.temperature = 0.2
print(a.temperature, b.temperature, Config.temperature)
Config.temperature = 1.0
print(a.temperature, b.temperature, Config.temperature)
```

```text
0.2 0.7 0.7
0.2 1.0 1.0
```

- `a.temperature = 0.2` создало атрибут у объекта `a`; у `b` его нет, поэтому `b` по-прежнему видит значение класса.
- `Config.temperature = 1.0` изменило атрибут класса — это увидели все объекты, у которых нет своего (то есть `b`), но не `a`.

Этим удобно пользоваться: атрибут класса работает как **значение по умолчанию**, которое отдельный объект может переопределить.

## Главная ловушка: изменяемый атрибут класса

Вспомните изменяемые значения по умолчанию из блока 1.6 — здесь та же история. Если атрибут класса — список или словарь, и вы его **изменяете** (а не присваиваете заново), изменение видят все:

```python
class Chat:
    messages = []          # ОШИБКА: один список на все объекты

    def add(self, text):
        self.messages.append(text)


work = Chat()
home = Chat()
work.add("отчёт готов?")
home.add("купи хлеб")
print(work.messages)
print(home.messages is work.messages)
```

```text
['отчёт готов?', 'купи хлеб']
True
```

`self.messages.append(...)` — это не присваивание, а изменение объекта. Python находит `messages` в классе (у экземпляра его нет) и меняет этот общий список. Обе «независимые» переписки оказались одной.

Правило: **изменяемые данные, которые должны быть у каждого объекта свои, создавайте в `__init__`**:

```python
class Chat:
    def __init__(self):
        self.messages = []   # новый список для каждого объекта

    def add(self, text):
        self.messages.append(text)


work = Chat()
home = Chat()
work.add("отчёт готов?")
print(work.messages, home.messages)
```

```text
['отчёт готов?'] []
```

Атрибуты класса годятся для **неизменяемых** общих значений (числа, строки, кортежи) и для данных, которые **намеренно** общие (реестр всех объектов, общий счётчик).

## Счётчик объектов

Классический пример намеренно общего состояния — сколько объектов создано. Обратите внимание: изменять атрибут класса нужно **через имя класса**, а не через `self`, иначе получится затенение:

```python
class Request:
    created = 0

    def __init__(self, prompt):
        Request.created += 1
        self.number = Request.created
        self.prompt = prompt


r1 = Request("Кто написал «Евгения Онегина»?")
r2 = Request("Переведи на английский")
r3 = Request("Сделай краткое содержание")
print(Request.created)
print(r1.number, r3.number)
```

```text
3
1 3
```

Если бы мы написали `self.created += 1`, это превратилось бы в `self.created = self.created + 1`: справа прочитали бы значение класса, а слева создали атрибут **экземпляра**. Счётчик класса остался бы нулём.

## Константы класса

Атрибуты класса — естественное место для констант, которые относятся к этому классу. По PEP 8 константы пишутся ЗАГЛАВНЫМИ буквами:

```python
class Tokenizer:
    MAX_LENGTH = 8
    UNKNOWN = "<unk>"

    def __init__(self, vocabulary):
        self.vocabulary = vocabulary

    def tokenize(self, text):
        words = text.lower().split()[: self.MAX_LENGTH]
        return [word if word in self.vocabulary else self.UNKNOWN for word in words]


tokenizer = Tokenizer({"я", "люблю", "python"})
print(tokenizer.tokenize("Я люблю Python и ML"))
```

```text
['я', 'люблю', 'python', '<unk>', '<unk>']
```

Внутри методов к константам обращаются через `self.MAX_LENGTH` (или `Tokenizer.MAX_LENGTH`). Вариант с `self` удобнее: подкласс сможет переопределить константу (урок 4).

## Методы, которые вызывают другие методы

Методы объекта вызывают друг друга через `self`. Так большой метод разбивается на маленькие понятные шаги — тот же принцип, что для функций в блоке 1.6:

```python
class Order:
    TAX = 0.2

    def __init__(self):
        self.items = []

    def add(self, name, price, quantity=1):
        self.items.append((name, price, quantity))

    def subtotal(self):
        return sum(price * quantity for _, price, quantity in self.items)

    def tax(self):
        return round(self.subtotal() * self.TAX, 2)

    def total(self):
        return self.subtotal() + self.tax()


order = Order()
order.add("Кофе", 250, 2)
order.add("Круассан", 180)
print(order.subtotal(), order.tax(), order.total())
```

```text
680 136.0 816.0
```

Метод `total` не повторяет вычислений — он опирается на `subtotal` и `tax`. Если правило налога изменится, править придётся одно место.

## Методы, меняющие объект, и методы, возвращающие новое

Методы бывают двух видов, и важно чётко понимать, к какому относится ваш:

- **Изменяющие** (мутирующие) меняют состояние объекта: `list.append`, `account.deposit`. Обычно возвращают `None` (или что-то полезное, например новый баланс).
- **Не изменяющие** вычисляют и возвращают результат, не трогая объект: `str.upper`, `order.total`.

Путаница здесь — частый источник ошибок. Строковые методы ничего не меняют (строки неизменяемы), поэтому `text.upper()` без присваивания бесполезен. А `items = items.sort()` превращает список в `None`, потому что `sort` меняет список на месте и возвращает `None`.

Хорошая практика: давайте методам имена, из которых понятно поведение. Глагол в повелительном наклонении (`add`, `reset`, `sort`) — меняет объект; существительное или прилагательное (`total`, `sorted_items`, `is_empty`) — возвращает значение.

## Цепочки вызовов: return self

Иногда изменяющий метод возвращает **сам объект** — `return self`. Тогда вызовы можно выстроить в цепочку. Такой стиль называют fluent interface; он популярен в построителях запросов и конфигураций:

```python
class PromptBuilder:
    def __init__(self):
        self.parts = []

    def role(self, text):
        self.parts.append(f"Ты — {text}.")
        return self

    def task(self, text):
        self.parts.append(f"Задача: {text}")
        return self

    def rule(self, text):
        self.parts.append(f"- {text}")
        return self

    def build(self):
        return "\n".join(self.parts)


prompt = (
    PromptBuilder()
    .role("опытный редактор")
    .task("сократи текст до трёх предложений")
    .rule("сохрани все числа")
    .rule("не добавляй выводов от себя")
    .build()
)
print(prompt)
```

```text
Ты — опытный редактор.
Задача: сократи текст до трёх предложений
- сохрани все числа
- не добавляй выводов от себя
```

Каждый метод добавляет часть и возвращает тот же объект, у которого сразу вызывается следующий метод. Длинную цепочку удобно заключать в круглые скобки и писать по одному вызову на строку.

## Доступ к атрибутам по имени: getattr, setattr, hasattr

Иногда имя атрибута известно только во время работы программы — например, приходит из конфигурации. Для этого есть встроенные функции:

```python
class Settings:
    def __init__(self):
        self.model = "mini"
        self.temperature = 0.7


settings = Settings()
updates = {"temperature": 0.2, "max_tokens": 512}
for name, value in updates.items():
    if hasattr(settings, name):
        setattr(settings, name, value)
    else:
        print(f"Неизвестная настройка: {name}")
print(getattr(settings, "temperature"))
print(getattr(settings, "top_p", 1.0))
```

```text
Неизвестная настройка: max_tokens
0.2
1.0
```

- `hasattr(obj, "name")` — есть ли атрибут;
- `getattr(obj, "name", default)` — прочитать атрибут, а если его нет — вернуть `default` (без `default` будет `AttributeError`);
- `setattr(obj, "name", value)` — то же, что `obj.name = value`.

Пользуйтесь ими только когда имя действительно динамическое. Писать `getattr(settings, "model")` вместо `settings.model` — лишнее усложнение.

## Разбор задачи: реестр моделей

Соберём вместе атрибуты класса и экземпляра. Нужно описывать доступные модели: у каждой — имя и цена за 1000 токенов; класс должен помнить все созданные модели и уметь найти самую дешёвую.

```python
class ModelInfo:
    registry = []          # намеренно общий список всех моделей
    CURRENCY = "USD"

    def __init__(self, name, price_per_1k):
        self.name = name
        self.price_per_1k = price_per_1k
        ModelInfo.registry.append(self)

    def cost(self, tokens):
        return round(tokens / 1000 * self.price_per_1k, 4)

    def describe(self):
        return f"{self.name}: {self.price_per_1k} {self.CURRENCY} / 1K"


ModelInfo("large", 0.03)
ModelInfo("medium", 0.01)
ModelInfo("small", 0.002)
cheapest = min(ModelInfo.registry, key=lambda model: model.price_per_1k)
print(len(ModelInfo.registry))
print(cheapest.describe())
print(cheapest.cost(25_000))
```

```text
3
small: 0.002 USD / 1K
0.05
```

Здесь общий список `registry` — сознательное решение: это «каталог» всех моделей, и менять его через имя класса (`ModelInfo.registry.append`) честно показывает, что изменяется общее состояние. А цена и имя — свои у каждой модели. Функция `min` с `key` (блок 1.6) отлично работает и со списком объектов.

## Попробуйте сами

- Добавьте в `Request` атрибут класса `MAX_PROMPT = 100` и бросайте `ValueError` в `__init__`, если промпт длиннее.
- В примере с `Config` выполните `del a.temperature` и выведите `a.temperature` — что увидите и почему?
- Добавьте в `PromptBuilder` метод `example(text)`, возвращающий `self`, и встройте его в цепочку.

## Частые ошибки

**1. Изменяемый атрибут класса вместо атрибута экземпляра.** `messages = []` в теле класса + `self.messages.append(...)` → все объекты делят один список. Создавайте списки и словари в `__init__`.

**2. `self.counter += 1` для общего счётчика.** Создаёт атрибут экземпляра, а счётчик класса не меняется. Пишите `ИмяКласса.counter += 1`.

**3. Изменение «настройки» через объект в надежде поменять для всех.** `obj.temperature = 0.2` меняет только этот объект; для всех — `ИмяКласса.temperature = 0.2`.

**4. Присваивание результата изменяющего метода.** `items = items.sort()` → `None`. Изменяющие методы обычно возвращают `None`.

**5. Забытый `return self` в цепочке.** Если один метод цепочки вернул `None`, следующий вызов упадёт с `AttributeError: 'NoneType' object has no attribute ...`.

**6. Обращение к атрибуту класса без `self.` или имени класса.** Внутри метода `MAX_LENGTH` (без `self.`) — `NameError`: тело класса не создаёт область видимости для методов.

## Где это в AI-инженерии

- **Конфигурации моделей.** Классы-конфиги в Hugging Face хранят значения по умолчанию как атрибуты класса (например, `model_type`), а конкретные параметры — как атрибуты экземпляра.
- **Реестры.** Библиотеки регистрируют модели, оптимизаторы и инструменты агентов в общем словаре класса — так по имени из конфигурации находится нужный класс.
- **Fluent API.** Построители промптов, запросов к векторным базам и пайплайнов (`pipeline.add(...).add(...)`) возвращают `self`.
- **Константы.** Специальные токены (`PAD`, `UNK`, `BOS`) хранятся как атрибуты класса токенизатора.
- **getattr/setattr.** Применение настроек из YAML-файла к объекту конфигурации, выбор функции активации по имени: `getattr(module, "relu")`.
- **Ловушка общего списка** — реальный источник багов в серверах с LLM: история одного пользователя «протекает» к другому, если хранится в атрибуте класса.

## Итоги урока

- Атрибут класса — в теле класса, один на всех; атрибут экземпляра — через `self` в методах, свой у каждого объекта.
- Поиск `obj.name`: объект → класс → родители → `AttributeError`. `vars(obj)` показывает атрибуты экземпляра.
- Присваивание через объект создаёт атрибут экземпляра и затеняет атрибут класса.
- Изменяемые данные объекта — только в `__init__`; атрибуты класса — для констант и намеренно общего состояния (менять через имя класса).
- Методы вызывают друг друга через `self`; изменяющие обычно возвращают `None`, для цепочек — `return self`.
- `getattr`/`setattr`/`hasattr` — для атрибутов, имя которых известно только во время работы.
