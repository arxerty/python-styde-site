# Наследование и super()

## Общее — в одном месте

Представьте, что в банке появились разные виды счетов: обычный, сберегательный (с процентами и ограничением на снятие) и кредитный (можно уйти в минус до лимита). У всех есть владелец, баланс, пополнение и описание. Если написать три независимых класса, общий код придётся скопировать трижды, а исправлять ошибку — в трёх местах.

**Наследование** позволяет создать новый класс на основе существующего: новый класс (**потомок**, подкласс, дочерний класс) получает все атрибуты и методы **родителя** (базового класса, суперкласса) и может добавить свои или изменить унаследованные.

```python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount

    def describe(self):
        return f"{self.owner}: {self.balance}"


class SavingsAccount(Account):
    pass


savings = SavingsAccount("Ада", 1000)
savings.deposit(500)
print(savings.describe())
print(isinstance(savings, SavingsAccount), isinstance(savings, Account))
```

```text
Ада: 1500
True True
```

- `class SavingsAccount(Account):` — в скобках указывается родитель.
- `SavingsAccount` ничего не определяет сам, но у него есть `__init__`, `deposit` и `describe` — унаследованные.
- Объект потомка — одновременно и экземпляр родителя: `isinstance(savings, Account)` — `True`. Сберегательный счёт **является** счётом.

## Как Python находит метод

Правило поиска атрибутов из урока 2 продолжается вверх по иерархии: объект → его класс → родитель → родитель родителя → ... → `object`. Первый найденный вариант и используется.

`object` — корень всех классов в Python. Даже `class Dog:` без скобок неявно наследует `object`; оттуда приходят `__repr__` по умолчанию, `__eq__` и другие базовые методы.

```python
class Animal:
    sound = "..."

    def speak(self):
        return f"{type(self).__name__}: {self.sound}"


class Dog(Animal):
    sound = "Гав"


class Puppy(Dog):
    pass


print(Puppy().speak())
print(Puppy.__mro__)
```

```text
Puppy: Гав
(<class '__main__.Puppy'>, <class '__main__.Dog'>, <class '__main__.Animal'>, <class 'object'>)
```

`Puppy().speak()`: метод `speak` найден в `Animal`, а `self.sound` — в `Dog` (поиск снова начинается от объекта). Атрибут `__mro__` (Method Resolution Order, порядок разрешения методов) показывает, в каком порядке Python просматривает классы.

Обратите внимание на `type(self).__name__`: метод написан в `Animal`, но `self` — это объект `Puppy`, поэтому и имя — `Puppy`. Метод родителя работает с реальным объектом потомка.

## Переопределение методов

Потомок может **переопределить** (override) метод — определить метод с тем же именем. Тогда для объектов потомка будет вызываться его версия:

```python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("недостаточно средств")
        self.balance -= amount


class CreditAccount(Account):
    def withdraw(self, amount):
        if amount > self.balance + 5000:
            raise ValueError("превышен кредитный лимит")
        self.balance -= amount


regular = Account("Ада", 100)
credit = CreditAccount("Алан", 100)
credit.withdraw(3000)
print(credit.balance)
try:
    regular.withdraw(3000)
except ValueError as error:
    print("Обычный счёт:", error)
```

```text
-2900
Обычный счёт: недостаточно средств
```

Один и тот же вызов `withdraw(3000)` ведёт себя по-разному в зависимости от класса объекта. На этом построен полиморфизм (урок 5).

## super(): вызвать версию родителя

Часто потомок хочет не заменить метод полностью, а **дополнить** его: сделать то же, что родитель, плюс что-то своё. Для вызова версии родителя служит `super()`:

```python
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def describe(self):
        return f"{self.owner}: {self.balance} руб."


class SavingsAccount(Account):
    def __init__(self, owner, balance=0, rate=0.05):
        super().__init__(owner, balance)
        self.rate = rate

    def add_interest(self):
        self.balance += round(self.balance * self.rate, 2)

    def describe(self):
        return super().describe() + f" (ставка {self.rate:.0%})"


savings = SavingsAccount("Ада", 1000, rate=0.1)
savings.add_interest()
print(savings.describe())
```

```text
Ада: 1100.0 руб. (ставка 10%)
```

Две типовые ситуации:

1. **`__init__` потомка.** Если потомок определяет свой `__init__`, родительский **не вызывается автоматически**. Чтобы родитель создал свои атрибуты (`owner`, `balance`), нужно явно вызвать `super().__init__(...)` — обычно первой строкой. Затем добавляются атрибуты потомка.
2. **Расширение метода.** `super().describe()` возвращает описание от родителя, к которому потомок добавляет своё. Код родителя не копируется.

Если забыть `super().__init__`, у объекта не будет атрибутов родителя, и первый же метод, который к ним обратится, упадёт с `AttributeError`.

## Переопределение констант класса

В уроке 2 мы обращались к константам через `self.КОНСТАНТА`. Вот зачем: потомок может переопределить константу, и методы родителя автоматически подхватят новое значение.

```python
class Account:
    FEE = 0

    def withdraw_cost(self, amount):
        return amount + self.FEE


class PremiumAccount(Account):
    FEE = -10


class BasicAccount(Account):
    FEE = 50


for account in (Account(), BasicAccount(), PremiumAccount()):
    print(type(account).__name__, account.withdraw_cost(1000))
```

```text
Account 1000
BasicAccount 1050
PremiumAccount 990
```

Метод `withdraw_cost` написан один раз, а поведение настраивается одной строкой в каждом потомке. Если бы в методе было `Account.FEE`, потомки не смогли бы ничего изменить.

## isinstance и issubclass

`isinstance(obj, Class)` проверяет, является ли объект экземпляром класса **или его потомков**. `issubclass(A, B)` — является ли класс `A` потомком `B` (класс считается подклассом самого себя):

```python
class Account:
    pass


class SavingsAccount(Account):
    pass


savings = SavingsAccount()
print(isinstance(savings, Account))
print(type(savings) == Account)
print(issubclass(SavingsAccount, Account), issubclass(Account, SavingsAccount))
print(isinstance(savings, (int, Account)))
```

```text
True
False
True False
True
```

Для проверок типа почти всегда нужен `isinstance`, а не `type(x) == ...`: последний не учитывает наследование и ломается на потомках. Вторым аргументом `isinstance` можно передать кортеж классов.

Вы уже пользовались наследованием в блоке 1.7: `class InsufficientFundsError(Exception)` — собственное исключение наследует `Exception`, а `except Exception` ловит его потому, что `isinstance(error, Exception)` истинно.

## Множественное наследование — коротко

Python позволяет наследовать от нескольких классов: `class C(A, B):`. Порядок поиска методов при этом определяет MRO (слева направо, с учётом общих предков). Чаще всего множественное наследование используют для **миксинов** — маленьких классов, добавляющих одну возможность:

```python
class ReprMixin:
    def __repr__(self):
        fields = ", ".join(f"{key}={value!r}" for key, value in vars(self).items())
        return f"{type(self).__name__}({fields})"


class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance


class SavingsAccount(ReprMixin, Account):
    pass


print(SavingsAccount("Ада", 500))
```

```text
SavingsAccount(owner='Ада', balance=500)
```

Миксин `ReprMixin` ничего не знает о счетах — он строит `__repr__` из атрибутов любого объекта. Сложные «ромбовидные» иерархии из нескольких полноценных родителей — признак плохого дизайна; ограничивайтесь миксинами.

## Когда наследование не нужно

Наследование выражает отношение **«является»** (is-a): сберегательный счёт является счётом, собака является животным. Если отношение — **«имеет»** (has-a): у банка есть счета, у автомобиля есть двигатель, у агента есть набор инструментов, — нужна **композиция**: объект хранит другой объект в атрибуте.

Типичная ошибка — наследовать ради пары полезных методов: `class Conversation(list)` даёт истории все методы списка, включая `sort` и `clear`, которые ей не нужны и могут нарушить инварианты. Лучше `self._messages = []` внутри. Подробно о выборе между наследованием и композицией — в блоке 2.2.

Ещё одно правило: потомок должен работать везде, где работает родитель (**принцип подстановки Лисков**). Если `SavingsAccount.deposit` вдруг стал требовать дополнительный обязательный аргумент, код, написанный для `Account`, сломается на сберегательном счёте.

## Разбор задачи: инструменты агента

LLM-агенты вызывают «инструменты»: поиск, калькулятор, запрос к базе. У всех инструментов общее: имя, описание для модели, проверка аргументов, счётчик вызовов. Различается сама работа.

```python
class Tool:
    name = "tool"
    description = ""

    def __init__(self):
        self.calls = 0

    def run(self, query):
        if not query.strip():
            raise ValueError("пустой запрос")
        self.calls += 1
        return self.execute(query.strip())

    def execute(self, query):
        raise NotImplementedError("потомок должен реализовать execute")

    def spec(self):
        return {"name": self.name, "description": self.description}


class Calculator(Tool):
    name = "calculator"
    description = "Складывает числа, записанные через +"

    def execute(self, query):
        return sum(float(part) for part in query.split("+"))


class Echo(Tool):
    name = "echo"
    description = "Повторяет запрос"

    def __init__(self, prefix=">> "):
        super().__init__()
        self.prefix = prefix

    def execute(self, query):
        return self.prefix + query


tools = [Calculator(), Echo()]
print(tools[0].run("2 + 3.5"))
print(tools[1].run("  привет "))
print([tool.spec()["name"] for tool in tools])
print(tools[0].calls, tools[1].calls)
```

```text
5.5
>> привет
['calculator', 'echo']
1 1
```

Посмотрите на распределение обязанностей:

- **Родитель `Tool`** реализует общий алгоритм `run`: проверка, подсчёт, вызов `execute`. Это шаблон, одинаковый для всех инструментов.
- **Потомки** переопределяют только `execute` и константы `name`/`description`. Метод родителя вызывает `self.execute(...)`, и Python находит версию потомка.
- `Echo` добавляет свой параметр, поэтому определяет `__init__` и **обязательно** вызывает `super().__init__()` — иначе не появится `self.calls`.
- `raise NotImplementedError` в родителе сообщает, что метод должен быть переопределён. В блоке 2.2 вы узнаете более строгий способ — абстрактные классы.

Такой приём — родитель задаёт алгоритм, потомки заполняют шаги — называется **шаблонный метод** (Template Method) и встречается в библиотеках повсюду.

## Попробуйте сами

- Добавьте инструмент `Upper`, возвращающий запрос заглавными буквами. Сколько строк понадобилось?
- Уберите `super().__init__()` из `Echo` и вызовите `run` — какая ошибка и почему?
- Выведите `SavingsAccount.__mro__` для класса с миксином и проследите порядок.

## Частые ошибки

**1. Забыть `super().__init__(...)`.** Свой `__init__` в потомке полностью заменяет родительский; атрибуты родителя не создаются → `AttributeError` позже, в неожиданном месте.

**2. Вызвать `super().__init__` с неверными аргументами.** Передавайте ровно то, что ожидает `__init__` родителя: `super().__init__(owner, balance)`, без `self`.

**3. `type(obj) == Parent` вместо `isinstance`.** Проверка по точному типу не пропускает потомков и ломает расширяемость.

**4. Копирование кода родителя в потомка.** Если переопределённый метод повторяет родительский и добавляет пару строк — используйте `super().method()`.

**5. Наследование ради удобства, а не по смыслу.** `class Agent(list)` или `class Config(dict)` тянут чужой интерфейс и ломают инварианты. Для «имеет» — композиция.

**6. Изменение сигнатуры метода в потомке.** Потомок с другими обязательными параметрами нарушает принцип подстановки: код, работающий с родителем, сломается на потомке.

## Где это в AI-инженерии

- **PyTorch.** Каждая модель — потомок `nn.Module`: `class Net(nn.Module)`, в `__init__` первой строкой `super().__init__()`, затем слои. Забытый `super().__init__()` — классическая ошибка новичков: PyTorch сообщит, что модуль не инициализирован.
- **Датасеты.** `class MyDataset(Dataset)` переопределяет `__len__` и `__getitem__`, а `DataLoader` работает с любым потомком.
- **scikit-learn.** Свои трансформеры наследуют `BaseEstimator` и `TransformerMixin` — родитель и миксин дают `get_params` и `fit_transform`.
- **Агенты и инструменты.** В LangChain свои инструменты наследуют `BaseTool` и переопределяют метод выполнения — ровно как в разборе выше.
- **Исключения SDK.** `RateLimitError` и `AuthenticationError` в SDK OpenAI и Anthropic — потомки общего `APIError`.

## Итоги урока

- `class Child(Parent):` — потомок получает атрибуты и методы родителя; поиск идёт по MRO до `object`.
- Переопределение — метод с тем же именем в потомке; `super().method()` вызывает версию родителя.
- Свой `__init__` в потомке должен вызывать `super().__init__(...)`.
- Константы через `self.CONST` позволяют потомкам настраивать поведение методов родителя.
- `isinstance` учитывает наследование — используйте его вместо `type(...) ==`.
- Наследование — для «является», композиция — для «имеет»; множественное наследование — в основном для миксинов.
