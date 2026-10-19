# @classmethod и @staticmethod

## Три вида методов

До сих пор все методы получали первым аргументом `self` — конкретный объект. Такие методы называются **методами экземпляра**: они работают с состоянием объекта. Но иногда метод логически относится к классу, а объект ему не нужен:

- создать объект **другим способом** — из словаря, строки, файла;
- изменить или прочитать **общее состояние класса** — счётчик, реестр;
- выполнить **вспомогательное вычисление**, которое связано с классом по смыслу, но не использует ни объект, ни класс.

Для первых двух случаев есть `@classmethod`, для третьего — `@staticmethod`.

```python
class Demo:
    def instance_method(self):
        return f"экземпляр: {type(self).__name__}"

    @classmethod
    def class_method(cls):
        return f"класс: {cls.__name__}"

    @staticmethod
    def static_method(x):
        return f"статический: {x * 2}"


demo = Demo()
print(demo.instance_method())
print(Demo.class_method())
print(Demo.static_method(21))
print(demo.class_method(), demo.static_method(1))
```

```text
экземпляр: Demo
класс: Demo
статический: 42
класс: Demo статический: 2
```

| Вид | Декоратор | Первый параметр | Доступ |
|---|---|---|---|
| Метод экземпляра | — | `self` (объект) | к объекту и (через него) к классу |
| Метод класса | `@classmethod` | `cls` (класс) | к классу, но не к конкретному объекту |
| Статический метод | `@staticmethod` | — | ни к объекту, ни к классу |

Методы класса и статические методы можно вызывать и через класс, и через объект — результат одинаковый.

## Альтернативные конструкторы

Главное применение `@classmethod` — **альтернативные конструкторы**. У класса может быть только один `__init__`, а способов создать объект — много. Данные о пользователе приходят то словарём из JSON, то строкой из CSV:

```python
class User:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    @classmethod
    def from_dict(cls, data):
        return cls(data["name"], int(data["age"]))

    @classmethod
    def from_csv_line(cls, line):
        name, age = line.split(",")
        return cls(name.strip(), int(age))

    def __repr__(self):
        return f"User({self.name!r}, {self.age})"


print(User("Ада", 36))
print(User.from_dict({"name": "Алан", "age": "41"}))
print(User.from_csv_line("Грейс, 85"))
```

```text
User('Ада', 36)
User('Алан', 41)
User('Грейс', 85)
```

Метод `from_dict` получает класс в параметре `cls` и вызывает `cls(...)` — то есть обычный конструктор с подготовленными аргументами. Имена альтернативных конструкторов по традиции начинаются с `from_`: так их сразу видно.

Вы уже встречали такие методы в стандартной библиотеке: `dict.fromkeys(["a", "b"], 0)` создаёт словарь, `date.fromisoformat("2024-05-01")` — дату из строки (блок 1.7), `int.from_bytes(...)` — число из байтов.

## Почему cls, а не имя класса

Можно было бы написать `return User(...)` вместо `return cls(...)`. Разница проявляется при наследовании: `cls` — это класс, **через который вызвали** метод. Если вызвать альтернативный конструктор у потомка, получится объект потомка:

```python
class Account:
    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

    @classmethod
    def from_dict(cls, data):
        return cls(data["owner"], data["balance"])

    @classmethod
    def empty(cls, owner):
        return cls(owner, 0)


class SavingsAccount(Account):
    rate = 0.05


savings = SavingsAccount.from_dict({"owner": "Ада", "balance": 1000})
print(type(savings).__name__, savings.rate)
print(type(SavingsAccount.empty("Алан")).__name__)
```

```text
SavingsAccount 0.05
SavingsAccount
```

`SavingsAccount` не переопределял `from_dict` и `empty`, но получил их «бесплатно» — и они создают именно сберегательные счета. Если бы внутри было `Account(...)`, потомок получал бы объекты родителя — тонкий баг, который сложно заметить.

## Методы класса для общего состояния

Второе применение `@classmethod` — работа с атрибутами класса. В уроке 2 мы меняли счётчик через имя класса; метод класса делает это аккуратнее и правильно работает с потомками:

```python
class Request:
    _count = 0

    def __init__(self, prompt):
        type(self)._register()
        self.prompt = prompt

    @classmethod
    def _register(cls):
        cls._count += 1

    @classmethod
    def count(cls):
        return cls._count

    @classmethod
    def reset(cls):
        cls._count = 0


Request("a")
Request("b")
print(Request.count())
Request.reset()
print(Request.count())
```

```text
2
0
```

Логика работы со счётчиком собрана в методах класса, и внешний код не трогает `_count` напрямую: `Request.count()` и `Request.reset()` — понятный публичный интерфейс. Вызов `type(self)._register()` из `__init__` обращается к классу объекта.

## Статические методы

`@staticmethod` — обычная функция, помещённая внутрь класса. Она не получает ни `self`, ни `cls`. Её кладут в класс, когда она **по смыслу** относится к нему: проверка формата, преобразование единиц, вспомогательный расчёт.

```python
class Temperature:
    def __init__(self, celsius):
        self.celsius = celsius

    @staticmethod
    def c_to_f(celsius):
        return celsius * 9 / 5 + 32

    @classmethod
    def from_fahrenheit(cls, fahrenheit):
        return cls((fahrenheit - 32) * 5 / 9)

    def as_fahrenheit(self):
        return self.c_to_f(self.celsius)


print(Temperature.c_to_f(100))
print(Temperature(37).as_fahrenheit())
print(round(Temperature.from_fahrenheit(212).celsius, 1))
```

```text
212.0
98.6
100.0
```

Здесь видны все три вида вместе: статический `c_to_f` — чистое вычисление; метод класса `from_fahrenheit` — альтернативный конструктор; метод экземпляра `as_fahrenheit` использует состояние объекта и вызывает статический метод через `self`.

Нужен ли статический метод, а не обычная функция модуля? Python-сообщество часто отвечает «функция модуля проще». Статический метод оправдан, когда функция без класса не имеет смысла, её удобно находить через класс (`Temperature.c_to_f`) или потомки должны иметь возможность её переопределить.

## Фабрики, которые выбирают класс

Альтернативный конструктор не обязан создавать объект именно `cls`. Иногда он решает, **какой** класс нужен, по входным данным. Такой метод называют **фабрикой**:

```python
class Shape:
    @classmethod
    def from_dict(cls, data):
        kinds = {"circle": Circle, "square": Square}
        kind = kinds[data["kind"]]
        return kind(data["size"])


class Circle(Shape):
    def __init__(self, radius):
        self.radius = radius


class Square(Shape):
    def __init__(self, side):
        self.side = side


shapes = [Shape.from_dict({"kind": "circle", "size": 2}), Shape.from_dict({"kind": "square", "size": 3})]
print([type(shape).__name__ for shape in shapes])
```

```text
['Circle', 'Square']
```

Код, читающий фигуры из JSON, вызывает одну точку входа — `Shape.from_dict` — и получает объекты нужных классов. Дальше с ними работают полиморфно (урок 5). В последней задаче урока вы увидите, как вместо жёстко прописанного словаря `kinds` использовать **реестр**, который пополняется по мере появления новых классов.

## Как выбрать вид метода

Простой алгоритм:

1. Метод использует данные **конкретного объекта** (`self.что-то`)? → обычный метод.
2. Метод создаёт объект или работает с **атрибутами класса**? → `@classmethod`.
3. Не использует ни того, ни другого, но относится к классу по смыслу? → `@staticmethod` (или функция модуля).

Частая ошибка новичков — делать всё статическими методами, превращая класс в «папку с функциями». Если в классе нет состояния и все методы статические, вам нужен модуль, а не класс.

## Разбор задачи: конфигурация эксперимента

Конфигурацию ML-эксперимента создают из словаря (загруженного из JSON/YAML), из строки параметров командной строки или берут готовую «по умолчанию». Нужна проверка значений и подсчёт созданных конфигураций.

```python
class ExperimentConfig:
    DEFAULTS = {"model": "baseline", "lr": 0.001, "epochs": 10}
    _created = 0

    def __init__(self, model, lr, epochs):
        self.model = model
        self.lr = self.check_positive("lr", lr)
        self.epochs = int(self.check_positive("epochs", epochs))
        type(self)._created += 1

    @staticmethod
    def check_positive(name, value):
        if value <= 0:
            raise ValueError(f"{name} должен быть положительным, получено {value}")
        return value

    @classmethod
    def default(cls):
        return cls(**cls.DEFAULTS)

    @classmethod
    def from_dict(cls, data):
        unknown = set(data) - set(cls.DEFAULTS)
        if unknown:
            raise ValueError(f"неизвестные поля: {sorted(unknown)}")
        return cls(**{**cls.DEFAULTS, **data})

    @classmethod
    def from_args(cls, text):
        data = {}
        for pair in text.split():
            key, value = pair.split("=")
            data[key] = value if key == "model" else float(value)
        return cls.from_dict(data)

    @classmethod
    def created(cls):
        return cls._created

    def __repr__(self):
        return f"ExperimentConfig(model={self.model!r}, lr={self.lr}, epochs={self.epochs})"


print(ExperimentConfig.default())
print(ExperimentConfig.from_dict({"lr": 0.01}))
print(ExperimentConfig.from_args("model=bert epochs=3"))
try:
    ExperimentConfig.from_dict({"dropout": 0.1})
except ValueError as error:
    print(error)
print(ExperimentConfig.created())
```

```text
ExperimentConfig(model='baseline', lr=0.001, epochs=10)
ExperimentConfig(model='baseline', lr=0.01, epochs=10)
ExperimentConfig(model='bert', lr=0.001, epochs=3)
неизвестные поля: ['dropout']
3
```

Обратите внимание на устройство:

- `from_args` не создаёт объект сам, а разбирает строку и делегирует `from_dict`, который добавляет значения по умолчанию и проверяет поля. Альтернативные конструкторы строятся друг на друге, и вся валидация в итоге проходит через `__init__`.
- `{**cls.DEFAULTS, **data}` объединяет словари: значения из `data` перекрывают умолчания.
- `check_positive` — статический метод: ему не нужны ни объект, ни класс, но по смыслу это часть конфигурации.
- Неудачная попытка создания не увеличила счётчик: исключение в `from_dict` возникло до вызова `__init__`.

## Попробуйте сами

- Добавьте в `User` альтернативный конструктор `from_string("Ада (36)")`.
- Создайте потомка `ExperimentConfig` с другими `DEFAULTS` и вызовите у него `default()`. Чьи значения по умолчанию использованы?
- Перепишите `Temperature.c_to_f` как функцию модуля. Что стало удобнее, а что — нет?

## Частые ошибки

**1. Забыть декоратор.** `def from_dict(cls, data):` без `@classmethod` — обычный метод: при вызове `User.from_dict({...})` словарь попадёт в `cls`, а `data` окажется не передан → `TypeError`.

**2. `return User(...)` вместо `return cls(...)`.** Альтернативный конструктор перестаёт работать для потомков: `SavingsAccount.from_dict` вернёт `Account`.

**3. Обращение к `self` в статическом или классовом методе.** Там нет `self` → `NameError`. Если методу нужен объект — это обычный метод.

**4. Дублирование валидации в каждом конструкторе.** Проверки должны жить в `__init__` (или в свойствах), а альтернативные конструкторы — только готовить аргументы и вызывать `cls(...)`.

**5. Класс из одних статических методов.** Это модуль, переодетый классом. Используйте функции.

**6. Изменение атрибута класса через `self` в обычном методе вместо `@classmethod`.** `self.count += 1` создаёт атрибут экземпляра (урок 2). Для общего состояния — `cls.count += 1` в методе класса.

## Где это в AI-инженерии

- **Hugging Face**: `AutoModel.from_pretrained("bert-base")`, `AutoTokenizer.from_pretrained(...)` — альтернативные конструкторы, которые скачивают веса и создают объект нужного класса. `from_pretrained` — пожалуй, самый вызываемый метод в мире NLP.
- **pandas**: `pd.DataFrame.from_dict(...)`, `pd.DataFrame.from_records(...)`, `pd.Timestamp.now()` — методы класса.
- **Pydantic** (блок 2.5): `Model.model_validate(data)`, `Model.model_validate_json(text)` — альтернативные конструкторы с проверкой.
- **Конфигурации экспериментов**: `Config.from_yaml(path)`, `Config.from_env()` — ровно как в разборе выше.
- **Клиенты API**: `Client.from_env()` берёт ключ из переменной окружения, вместо того чтобы требовать его аргументом.
- **datetime**: `datetime.now()`, `datetime.fromisoformat(...)`, `date.today()` — методы класса, создающие объекты.

## Итоги урока

- Обычный метод получает `self` и работает с объектом; `@classmethod` получает `cls` и работает с классом; `@staticmethod` не получает ничего.
- Главное применение `@classmethod` — альтернативные конструкторы `from_...`, которые вызывают `cls(...)`.
- `cls` вместо имени класса делает конструкторы корректными для потомков.
- Методы класса удобны для общего состояния: счётчиков, реестров.
- `@staticmethod` — вспомогательная функция, связанная с классом по смыслу; если класс состоит только из них — нужен модуль.
- Валидация — в `__init__`, альтернативные конструкторы только готовят аргументы.
