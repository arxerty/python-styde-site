# Шпаргалка: ООП — основы

## Класс, объект, __init__, self

```python norun
class BankAccount:                       # имя — CapWords
    def __init__(self, owner, balance=0):   # вызывается при создании
        self.owner = owner               # атрибут экземпляра
        self.balance = balance

    def deposit(self, amount):           # метод: первый параметр self
        self.balance += amount
        return self.balance

    def __str__(self):                   # print(obj), str(obj) — для пользователя
        return f"{self.owner}: {self.balance}"

    def __repr__(self):                  # списки, консоль, отладка — для разработчика
        return f"BankAccount({self.owner!r}, {self.balance})"


account = BankAccount("Ада", 100)        # создать объект
account.deposit(50)                      # = BankAccount.deposit(account, 50)
```

- `__init__` ничего не возвращает; атрибуты создаются только через `self.имя = ...`.
- У каждого объекта своё состояние.

## Атрибуты класса и экземпляра

| | Где объявлен | Чей |
|---|---|---|
| Атрибут класса | в теле класса | общий для всех объектов |
| Атрибут экземпляра | `self.x = ...` в методах | у каждого объекта свой |

```python norun
class Request:
    MAX_LEN = 1000          # константа класса
    created = 0             # намеренно общее состояние

    def __init__(self, prompt):
        Request.created += 1          # менять общее — через имя класса
        self.prompt = prompt
        self.history = []             # изменяемое — только в __init__!
```

- Поиск `obj.x`: объект → класс → родители → `AttributeError`.
- Присваивание `obj.x = ...` создаёт атрибут экземпляра (затеняет атрибут класса).
- `vars(obj)` — словарь атрибутов экземпляра.
- `getattr(obj, "x", default)`, `setattr(obj, "x", v)`, `hasattr(obj, "x")` — доступ по имени.
- Цепочки вызовов: метод возвращает `self`.

## Инкапсуляция и @property

| Имя | Смысл |
|---|---|
| `name` | публичный интерфейс |
| `_name` | внутреннее, снаружи не трогать (соглашение) |
| `__name` | искажение имени → `_Class__name` (защита от конфликтов при наследовании) |
| `__name__` | специальные имена Python |

```python norun
class Params:
    def __init__(self, temperature):
        self.temperature = temperature        # через сеттер → проверка работает

    @property
    def temperature(self):                     # obj.temperature — без скобок
        return self._temperature               # хранение — в _temperature

    @temperature.setter
    def temperature(self, value):
        if not 0 <= value <= 2:
            raise ValueError("от 0 до 2")
        self._temperature = value

    @property
    def is_hot(self):                          # вычисляемое, только чтение
        return self._temperature > 1
```

- Без сеттера свойство только для чтения: присваивание → `AttributeError`.
- Свойство — быстрая характеристика; долгое действие — метод.
- Наружу отдавайте копии (`tuple(self._items)`), а не внутренние списки.

## Наследование и super()

```python norun
class SavingsAccount(BankAccount):            # потомок
    RATE = 0.05                                # переопределённая константа

    def __init__(self, owner, balance=0, rate=None):
        super().__init__(owner, balance)       # обязательно, если свой __init__
        self.rate = rate or self.RATE

    def deposit(self, amount):                 # переопределение
        result = super().deposit(amount)       # + поведение родителя
        return result
```

- `isinstance(obj, Parent)` учитывает наследование; `type(obj) == Parent` — нет.
- `issubclass(Child, Parent)`; `Class.__mro__` — порядок поиска методов.
- Метод родителя, вызывающий `self.step()`, получит версию потомка (шаблонный метод).
- `raise NotImplementedError` — «потомок обязан переопределить».
- «Является» → наследование; «имеет» → композиция (объект в атрибуте).
- Множественное наследование — в основном для миксинов: `class C(ReprMixin, Base)`.

## Полиморфизм и утиная типизация

```python norun
def notify_all(channels, text):        # любые объекты с методом send(text)
    return [channel.send(text) for channel in channels]

try:                                   # EAFP — стиль Python
    size = len(obj)
except TypeError:
    size = None
```

- Один интерфейс — разные реализации; вместо цепочек `if type == ...` — методы классов.
- Специальные методы подключают объект к встроенным функциям: `len` → `__len__`, `str` → `__str__`; при наличии `__len__` пустой объект ложен.
- Зависимости (модель, клиент API) передавайте снаружи — легко подменить фейком в тестах.

## @classmethod и @staticmethod

| Вид | Декоратор | Получает | Для чего |
|---|---|---|---|
| обычный | — | `self` | работа с объектом |
| метод класса | `@classmethod` | `cls` | альтернативные конструкторы, общее состояние |
| статический | `@staticmethod` | ничего | вспомогательная функция по смыслу класса |

```python norun
class User:
    def __init__(self, name, age):
        self.name, self.age = name, age

    @classmethod
    def from_dict(cls, data):              # альтернативный конструктор
        return cls(data["name"], int(data["age"]))   # cls, а не User!

    @staticmethod
    def is_valid_name(name):
        return name.isalpha()
```

## Частые ошибки

| Ошибка | Симптом | Исправление |
|---|---|---|
| Нет `self` в определении метода | `TypeError: ... takes 0 positional arguments but 1 was given` | `def method(self, ...)` |
| `name = name` в `__init__` | `AttributeError` при обращении | `self.name = name` |
| Список — атрибут класса | данные «протекают» между объектами | создавать в `__init__` |
| `self.counter += 1` для общего счётчика | счётчик класса не меняется | `Class.counter += 1` / `cls.counter` |
| `return self.x` в геттере `x` | `RecursionError` | хранить в `self._x` |
| Нет `super().__init__()` | нет атрибутов родителя | вызвать первой строкой |
| `return User(...)` в `@classmethod` | потомки получают объект родителя | `return cls(...)` |
| Забыт `@classmethod` | `TypeError` из-за аргументов | добавить декоратор |

## В AI-инженерии

- `class Net(nn.Module)` + `super().__init__()` — модели PyTorch.
- `model.fit()` / `model.predict()` — объекты scikit-learn и утиная типизация.
- `AutoModel.from_pretrained(...)` — альтернативный конструктор.
- `tensor.shape`, `df.columns` — свойства; `df.head()` — метод.
- Фейковая модель с `generate()` вместо API — тесты без сети.
