# Инкапсуляция: _, __ и @property

## Зачем защищать данные объекта

Вернёмся к банковскому счёту из урока 1. Метод `withdraw` проверяет, что денег хватает. Но ничто не мешает написать:

```python
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("недостаточно средств")
        self.balance -= amount


account = BankAccount("Ада", 100)
account.balance = -1_000_000
print(account.balance)
```

```text
-1000000
```

Все проверки в методах обойдены одной строкой. У объекта есть **инварианты** — условия, которые должны выполняться всегда: «баланс не отрицательный», «температура от 0 до 2», «в истории не больше N сообщений». Если любой код может напрямую менять атрибуты, инварианты держатся только на честном слове.

**Инкапсуляция** — принцип: объект сам отвечает за своё состояние. Внешний код работает через **публичный интерфейс** (методы и разрешённые атрибуты), а внутреннее устройство скрыто и может меняться без поломки остальной программы.

В Java или C++ для этого есть ключевые слова `private` и `public`, и компилятор запрещает доступ. Python устроен иначе: он доверяет программисту и опирается на **соглашения**. Девиз сообщества: «мы все здесь взрослые люди» (we are all consenting adults). Но соглашения строгие, и их соблюдают все.

## Одно подчёркивание: «внутреннее, не трогать»

Имя, начинающееся с одного подчёркивания, — сигнал: это деталь реализации, снаружи не используйте.

```python
class Conversation:
    def __init__(self, max_messages=3):
        self._messages = []
        self._max = max_messages

    def add(self, text):
        self._messages.append(text)
        self._trim()

    def _trim(self):
        while len(self._messages) > self._max:
            self._messages.pop(0)

    def history(self):
        return list(self._messages)


chat = Conversation()
for text in ["a", "b", "c", "d"]:
    chat.add(text)
print(chat.history())
```

```text
['b', 'c', 'd']
```

Технически `chat._messages` доступен снаружи — Python не запретит. Но любой Python-разработчик, увидев `_`, понимает: «это не для меня; если обращусь — сам виноват, когда автор класса это поменяет». Редакторы и линтеры подсвечивают такие обращения.

Обратите внимание на метод `history`: он возвращает **копию** списка (`list(...)`). Если вернуть сам `self._messages`, внешний код сможет сделать `chat.history().append(...)` и обойти обрезку. Отдавать наружу изменяемые внутренние объекты — частая дыра в инкапсуляции.

## Два подчёркивания: искажение имени

Имя с двумя подчёркиваниями в начале (и не более одного в конце) Python **переименовывает** внутри класса: `__secret` в классе `Vault` превращается в `_Vault__secret`. Это называется **name mangling**:

```python
class Vault:
    def __init__(self, secret):
        self.__secret = secret

    def check(self, guess):
        return guess == self.__secret


vault = Vault("1234")
print(vault.check("1234"))
print(hasattr(vault, "__secret"))
print(vault._Vault__secret)
```

```text
True
False
1234
```

Снаружи `vault.__secret` не найдётся, но под искажённым именем атрибут доступен — значит, это **не защита от взлома**. Настоящее назначение `__` — избежать **конфликта имён при наследовании** (урок 4): если подкласс случайно заведёт атрибут с таким же именем, он не перезапишет атрибут родителя.

На практике:

- `_name` — стандартный способ пометить внутреннее. Используйте его в 99% случаев.
- `__name` — только когда класс рассчитан на наследование и нужно уберечь атрибут от случайного переопределения.
- `__name__` (с подчёркиваниями с обеих сторон) — специальные имена Python, свои такие не придумывайте.

## @property: атрибут с проверкой

Допустим, мы спрятали баланс в `_balance` и добавили метод `get_balance()`. Работает, но неудобно: везде `account.get_balance()` вместо естественного `account.balance`. А если класс уже используется сотней мест кода как `account.balance`, переход на методы сломает их все.

Python решает это **свойствами** (property). Декоратор `@property` превращает метод в «атрибут», который вычисляется при чтении:

```python
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self._balance = balance

    @property
    def balance(self):
        return self._balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("сумма должна быть положительной")
        self._balance += amount


account = BankAccount("Ада", 100)
account.deposit(50)
print(account.balance)
try:
    account.balance = 999
except AttributeError as error:
    print("Ошибка:", error)
```

```text
150
Ошибка: property 'balance' of 'BankAccount' object has no setter
```

- `account.balance` — без скобок! Python сам вызывает метод `balance`.
- Присвоить нельзя: у свойства нет **сеттера**, оно только для чтения. Менять баланс можно лишь через `deposit` и `withdraw`, где есть проверки.

Декоратор — это строка `@имя` над функцией, которая изменяет её поведение. Как они устроены, вы узнаете в блоке 2.4; сейчас достаточно уметь ими пользоваться.

## Сеттер: проверка при присваивании

Если атрибут нужно разрешить менять, но с проверкой, добавляют сеттер — метод с тем же именем и декоратором `@имя.setter`:

```python
class GenerationParams:
    def __init__(self, temperature=0.7):
        self.temperature = temperature    # вызывает сеттер!

    @property
    def temperature(self):
        return self._temperature

    @temperature.setter
    def temperature(self, value):
        if not 0 <= value <= 2:
            raise ValueError(f"temperature должна быть от 0 до 2, получено {value}")
        self._temperature = value


params = GenerationParams()
params.temperature = 1.2
print(params.temperature)
try:
    params.temperature = 5
except ValueError as error:
    print(error)
try:
    GenerationParams(temperature=-1)
except ValueError as error:
    print(error)
```

```text
1.2
temperature должна быть от 0 до 2, получено 5
temperature должна быть от 0 до 2, получено -1
```

Ключевой приём: в `__init__` пишем `self.temperature = temperature` (без подчёркивания). Это присваивание идёт через сеттер, поэтому **проверка работает и при создании объекта**. Логика проверки живёт в одном месте.

Внутри свойства значение хранится в атрибуте с другим именем (`_temperature`). Если в геттере написать `return self.temperature`, свойство будет вызывать само себя бесконечно → `RecursionError`.

## Вычисляемые свойства

Свойство не обязано хранить данные — оно может вычислять значение из других атрибутов. Так значение всегда актуально и никогда не «рассинхронизируется»:

```python
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):
        return self.width * self.height

    @property
    def is_square(self):
        return self.width == self.height


r = Rectangle(3, 4)
print(r.area, r.is_square)
r.width = 4
print(r.area, r.is_square)
```

```text
12 False
16 True
```

Если бы `area` вычислялась один раз в `__init__` и хранилась в атрибуте, после изменения `width` она стала бы неверной.

## Свойство или метод?

Когда делать `@property`, а когда обычный метод? Ориентиры:

| Свойство (`obj.x`) | Метод (`obj.x()`) |
|---|---|
| Выглядит как характеристика объекта: `balance`, `area`, `is_empty` | Действие: `deposit()`, `save()`, `send()` |
| Вычисляется быстро | Может быть долгим: запрос к сети, обход файла |
| Не имеет побочных эффектов | Меняет состояние или внешний мир |
| Без параметров | Принимает аргументы |

Пользователь, видя `obj.size`, ожидает мгновенного ответа. Если за свойством прячется HTTP-запрос на секунду — это ловушка для читающего код.

## Разбор задачи: клиент API со скрытым ключом

Соберём всё вместе. Нужен класс клиента LLM API: ключ нельзя показывать в логах, модель можно менять только на одну из разрешённых, а счётчик потраченных токенов — только увеличивать через метод.

```python
class LLMClient:
    MODELS = ("small", "medium", "large")

    def __init__(self, api_key, model="small"):
        if not api_key.startswith("sk-"):
            raise ValueError("ключ должен начинаться с sk-")
        self._api_key = api_key
        self.model = model
        self._tokens_used = 0

    @property
    def model(self):
        return self._model

    @model.setter
    def model(self, value):
        if value not in self.MODELS:
            raise ValueError(f"неизвестная модель: {value}")
        self._model = value

    @property
    def tokens_used(self):
        return self._tokens_used

    @property
    def masked_key(self):
        return self._api_key[:3] + "..." + self._api_key[-4:]

    def record_usage(self, tokens):
        if tokens < 0:
            raise ValueError("число токенов не может быть отрицательным")
        self._tokens_used += tokens

    def __repr__(self):
        return f"LLMClient(model={self.model!r}, key={self.masked_key!r})"


client = LLMClient("sk-abcdef123456789")
client.model = "large"
client.record_usage(120)
client.record_usage(80)
print(client)
print(client.tokens_used)
```

```text
LLMClient(model='large', key='sk-...6789')
200
```

Разберём решения:

- `_api_key` скрыт за `_`, а наружу отдаётся только `masked_key` — так ключ не утечёт в логи через `print(client)`.
- `model` — свойство с сеттером: менять можно, но только на допустимое значение, и проверка срабатывает уже в `__init__`.
- `tokens_used` — свойство без сеттера: снаружи только чтение, а увеличивать можно лишь через `record_usage` с проверкой.

## Попробуйте сами

- Добавьте в `BankAccount` метод `withdraw` с проверкой и убедитесь, что `account.balance = 0` по-прежнему вызывает ошибку.
- Добавьте в `Rectangle` свойство `perimeter` и сеттеры для `width`/`height`, запрещающие неположительные значения.
- В `GenerationParams` замените в геттере `self._temperature` на `self.temperature` и посмотрите на ошибку.

## Частые ошибки

**1. Рекурсия в свойстве.** `return self.temperature` внутри геттера `temperature` (или `self.temperature = value` внутри сеттера) вызывает свойство снова и снова → `RecursionError`. Храните значение в `self._temperature`.

**2. Проверка только в сеттере, а в `__init__` — присваивание в `self._x`.** Тогда при создании объекта проверка не работает. В `__init__` присваивайте через свойство: `self.x = x`.

**3. Скобки при обращении к свойству.** `account.balance()` → `TypeError: 'int' object is not callable`: свойство уже вернуло число.

**4. Возврат внутреннего изменяемого объекта.** `return self._messages` позволяет менять список снаружи в обход проверок. Возвращайте копию или кортеж.

**5. `__name` как «защита».** Двойное подчёркивание не скрывает данные — до них можно добраться через `_Class__name`. Для пометки «внутреннее» хватает одного подчёркивания.

**6. Тяжёлые вычисления в свойстве.** Запрос к API или чтение большого файла за обычным `obj.data` удивит читающего. Для долгих действий — методы.

## Где это в AI-инженерии

- **Параметры генерации.** Клиенты LLM проверяют `temperature`, `top_p`, `max_tokens` — так, как в примере выше; Pydantic (блок 2.5) делает такую проверку декларативной.
- **Секреты.** Ключи API хранятся во внутренних атрибутах и маскируются в `__repr__`, чтобы не попасть в логи и трейсбеки.
- **PyTorch.** У модулей есть свойства вроде `model.training`, а у тензоров — `tensor.shape`, `tensor.device`, `tensor.T`: это вычисляемые свойства без скобок.
- **pandas.** `df.shape`, `df.columns`, `df.T` — свойства; `df.head()`, `df.describe()` — методы. Разница ровно по правилу «характеристика или действие».
- **Счётчики использования.** Токены и стоимость запросов копятся во внутреннем атрибуте и отдаются только для чтения — чтобы их нельзя было случайно обнулить.

## Итоги урока

- Инкапсуляция: объект сам охраняет свои инварианты, снаружи — только публичный интерфейс.
- `_name` — соглашение «внутреннее»; `__name` — искажение имени для защиты от конфликтов при наследовании, а не от доступа.
- `@property` — метод, который читается как атрибут; без сеттера — только чтение.
- `@x.setter` — проверка при присваивании; в `__init__` присваивайте через свойство, значение храните в `_x`.
- Вычисляемые свойства всегда актуальны; свойства — для быстрых характеристик, методы — для действий.
