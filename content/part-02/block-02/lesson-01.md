# Dunder-методы: __str__, __repr__, __eq__, __len__, __getitem__

## Модель данных Python

Почему `len("abc")` работает, а у строки нет метода `.len()`? Почему `x in my_list` и `x in my_dict` пишутся одинаково, хотя внутри устроены совсем по-разному? Ответ — **модель данных Python** (data model): набор соглашений о специальных методах. Встроенная функция или оператор не знает, как устроен объект; она вызывает у него специальный метод с заранее известным именем:

| Вы пишете | Python вызывает |
|---|---|
| `len(obj)` | `obj.__len__()` |
| `str(obj)`, `print(obj)` | `obj.__str__()` |
| `repr(obj)` | `obj.__repr__()` |
| `a == b` | `a.__eq__(b)` |
| `obj[key]` | `obj.__getitem__(key)` |
| `x in obj` | `obj.__contains__(x)` |
| `bool(obj)`, `if obj:` | `obj.__bool__()` (или `__len__`) |

Такие методы называют **dunder-методами** (double underscore — двойное подчёркивание) или «магическими». В уроках 1 и 5 прошлого блока вы уже написали `__init__`, `__str__`, `__repr__` и `__len__`. Теперь разберём систему целиком: реализуя нужные методы, вы делаете свои классы такими же удобными, как встроенные типы.

Важное правило: dunder-методы **вызывает Python**, а не вы. Пишите `len(obj)`, а не `obj.__len__()`.

## __repr__ и __str__: два представления

```python
class Model:
    def __init__(self, name, params):
        self.name = name
        self.params = params

    def __repr__(self):
        return f"Model(name={self.name!r}, params={self.params})"

    def __str__(self):
        return f"{self.name} ({self.params / 1e6:.0f}M параметров)"


model = Model("tiny-bert", 14_200_000)
print(model)
print(repr(model))
print([model])
print(f"{model}  |  {model!r}")
```

```text
tiny-bert (14M параметров)
Model(name='tiny-bert', params=14200000)
[Model(name='tiny-bert', params=14200000)]
tiny-bert (14M параметров)  |  Model(name='tiny-bert', params=14200000)
```

- `__repr__` — однозначное представление для разработчика: в консоли, отладчике, логах и внутри коллекций. Идеал — строка, которую можно скопировать в код и получить такой же объект. Поэтому строки внутри `__repr__` выводят через `!r` — с кавычками.
- `__str__` — человекочитаемый вид для `print` и f-строк.
- Если определён только `__repr__`, он используется и для `str()`. Обратное неверно. Поэтому **`__repr__` пишут всегда**, а `__str__` — когда нужен особый вид для пользователя.
- В f-строке `{obj!r}` вызывает `repr`, а `{obj}` — `str`.

## __eq__: равенство

По умолчанию `==` для ваших объектов сравнивает **идентичность**: два объекта равны, только если это один и тот же объект. Чаще всего это не то, что нужно:

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y


print(Point(1, 2) == Point(1, 2))


class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __eq__(self, other):
        if not isinstance(other, Point):
            return NotImplemented
        return (self.x, self.y) == (other.x, other.y)


print(Point(1, 2) == Point(1, 2), Point(1, 2) != Point(3, 4))
print(Point(1, 2) == "точка")
```

```text
False
True True
False
```

Разберём детали:

- Сравнение через кортежи `(self.x, self.y) == (other.x, other.y)` — короткий способ сравнить все поля сразу.
- Если `other` — объект другого типа, метод возвращает специальное значение **`NotImplemented`** (не путать с исключением `NotImplementedError`!). Это сигнал Python: «я не умею сравнивать с этим, спроси другой объект». Если и тот не умеет, `==` вернёт `False`.
- `!=` Python выводит из `__eq__` автоматически.

### Равенство и хеширование

Есть подвох: определив `__eq__`, вы делаете объекты **нехешируемыми** — их нельзя класть в `set` и использовать как ключи словаря:

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __eq__(self, other):
        return isinstance(other, Point) and (self.x, self.y) == (other.x, other.y)


try:
    {Point(1, 2)}
except TypeError as error:
    print(error)
```

```text
unhashable type: 'Point'
```

Множества и словари ищут элементы по **хешу** (блок 1.5): равные объекты обязаны иметь равные хеши. Python не знает, как согласовать хеш с вашим `__eq__`, и отключает хеширование. Если объект **неизменяемый** по смыслу, добавьте `__hash__` из тех же полей:

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __eq__(self, other):
        return isinstance(other, Point) and (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))


points = {Point(1, 2), Point(1, 2), Point(0, 0)}
print(len(points))
```

```text
2
```

Если же объект изменяемый, хешировать его опасно: изменили поле — хеш поменялся, и объект «потерялся» внутри множества. Изменяемые объекты оставляют нехешируемыми.

## __len__ и __bool__

`__len__` возвращает неотрицательное целое. Если `__bool__` не определён, Python использует `__len__` для проверки истинности: длина 0 — ложь.

```python
class Batch:
    def __init__(self, items):
        self._items = list(items)

    def __len__(self):
        return len(self._items)


class Response:
    def __init__(self, status):
        self.status = status

    def __bool__(self):
        return 200 <= self.status < 300


print(len(Batch([1, 2, 3])), bool(Batch([])))
print(bool(Response(200)), bool(Response(404)))
```

```text
3 False
True False
```

`__bool__` пригодится, когда «истинность» объекта не связана с размером: успешен ли ответ, валиден ли результат. Но не злоупотребляйте: `if response:` должно читаться очевидно.

## __getitem__: индексы и ключи

`__getitem__(self, key)` вызывается при `obj[key]`. Что такое `key` — решаете вы: число, строка, кортеж или срез.

```python
class Vocabulary:
    def __init__(self, words):
        self._words = list(words)
        self._index = {word: i for i, word in enumerate(self._words)}

    def __len__(self):
        return len(self._words)

    def __getitem__(self, key):
        if isinstance(key, str):
            return self._index[key]
        return self._words[key]

    def __contains__(self, word):
        return word in self._index


vocab = Vocabulary(["<pad>", "привет", "мир"])
print(vocab["мир"], vocab[1])
print(vocab[-1], vocab[0:2])
print("мир" in vocab, "кот" in vocab)
```

```text
2 привет
мир ['<pad>', 'привет']
True False
```

- `vocab["мир"]` — строковый ключ, возвращаем индекс слова.
- `vocab[1]`, `vocab[-1]`, `vocab[0:2]` — число или **срез** передаются в список, и он сам их обрабатывает. Запись `obj[0:2]` превращается в `obj.__getitem__(slice(0, 2, None))`.
- `__contains__` делает быстрым оператор `in`. Без него Python перебирал бы элементы через `__getitem__` с индексами 0, 1, 2… — медленно, а для строковых ключей и неправильно.

Если ключа нет, `__getitem__` должен бросать `KeyError` (для словарных ключей) или `IndexError` (для позиций) — так поступают встроенные типы, и код вокруг рассчитывает на это поведение.

### Бонус: перебор бесплатно

Объект с `__getitem__`, принимающим индексы 0, 1, 2…, можно перебирать в `for`: Python вызывает `obj[0]`, `obj[1]`… пока не получит `IndexError`. Правильный протокол итерации (`__iter__`) — тема блока 2.3, но этот запасной механизм полезно знать:

```python
class Squares:
    def __init__(self, n):
        self.n = n

    def __len__(self):
        return self.n

    def __getitem__(self, index):
        if not 0 <= index < self.n:
            raise IndexError("индекс вне диапазона")
        return index ** 2


squares = Squares(5)
print(list(squares), sum(squares), squares[3])
```

```text
[0, 1, 4, 9, 16] 30 9
```

## __setitem__ и __delitem__

Для записи и удаления по ключу — пара методов `__setitem__(self, key, value)` и `__delitem__(self, key)`. Они позволяют добавить к присваиванию проверку:

```python
class Config:
    ALLOWED = {"model", "temperature", "max_tokens"}

    def __init__(self):
        self._data = {}

    def __setitem__(self, key, value):
        if key not in self.ALLOWED:
            raise KeyError(f"неизвестная настройка: {key}")
        self._data[key] = value

    def __getitem__(self, key):
        return self._data[key]

    def __delitem__(self, key):
        del self._data[key]

    def __repr__(self):
        return f"Config({self._data})"


config = Config()
config["model"] = "mini"
config["temperature"] = 0.3
del config["temperature"]
print(config)
try:
    config["colour"] = "red"
except KeyError as error:
    print(error)
```

```text
Config({'model': 'mini'})
'неизвестная настройка: colour'
```

Обратите внимание: `str(KeyError(...))` выводит сообщение в кавычках — особенность именно `KeyError`.

## Разбор задачи: датасет для обучения

В PyTorch датасет — это класс с двумя обязательными методами: `__len__` (сколько примеров) и `__getitem__(i)` (вернуть i-й пример). Всё остальное — перемешивание, батчи, параллельная загрузка — делает `DataLoader`, опираясь только на эти два метода. Напишем похожий датасет отзывов:

```python
class ReviewsDataset:
    LABELS = {"neg": 0, "pos": 1}

    def __init__(self, rows):
        self._rows = [(text.lower().strip(), self.LABELS[label]) for text, label in rows]

    def __len__(self):
        return len(self._rows)

    def __getitem__(self, index):
        if isinstance(index, slice):
            return [self[i] for i in range(*index.indices(len(self)))]
        text, label = self._rows[index]
        return {"text": text, "label": label}

    def __repr__(self):
        return f"ReviewsDataset(size={len(self)})"


data = ReviewsDataset([("Отлично!", "pos"), ("  Ужасно ", "neg"), ("Неплохо", "pos")])
print(data)
print(data[1])
print([item["label"] for item in data])
print(len(data[0:2]))
```

```text
ReviewsDataset(size=3)
{'text': 'ужасно', 'label': 0}
[1, 0, 1]
2
```

Что здесь важно:

- предобработка (нижний регистр, метки в числа) делается один раз в `__init__`;
- `__getitem__` возвращает пример в удобном формате — словарь;
- для среза `slice.indices(len(self))` превращает срез с отрицательными и пропущенными границами в конкретные `start, stop, step`, а `self[i]` переиспользует логику для одного элемента;
- перебор в `for` работает автоматически через `__getitem__` и `IndexError` от списка.

## Попробуйте сами

- Добавьте в `Vocabulary` метод `__repr__`, показывающий число слов.
- Уберите `__hash__` из последней версии `Point` и попробуйте создать множество точек.
- Добавьте в `ReviewsDataset` метод `__contains__`, проверяющий, есть ли текст в датасете.

## Частые ошибки

**1. Вызов dunder-метода напрямую.** `obj.__len__()` вместо `len(obj)` — работает, но не принято и обходит проверки, которые делает встроенная функция (например, что результат — неотрицательное целое).

**2. `__repr__` или `__str__` возвращает не строку.** `return self.name, self.age` (кортеж) → `TypeError: __repr__ returned non-string`.

**3. `raise NotImplemented` или `return NotImplementedError`.** Из операторов **возвращают** `NotImplemented`; исключение `NotImplementedError` **бросают** в абстрактных методах. Перепутать их — частая ошибка.

**4. `__eq__` без `__hash__` для объектов, которые кладут в множества.** `TypeError: unhashable type`. Для неизменяемых объектов добавьте `__hash__` из тех же полей, что сравниваются.

**5. `__eq__`, падающий на чужом типе.** `return self.x == other.x` бросит `AttributeError` при сравнении со строкой. Сначала проверьте тип.

**6. `__getitem__`, бросающий не то исключение.** Если вместо `IndexError` вернуть `None`, перебор в `for` станет бесконечным.

## Где это в AI-инженерии

- **PyTorch Dataset** — ровно `__len__` + `__getitem__`; на них построена вся загрузка данных.
- **Токенизаторы**: `tokenizer.vocab["слово"]`, `len(tokenizer)` — словарь и длина через dunder-методы.
- **NumPy и pandas** переопределяют `__getitem__` для мощной индексации: `array[0, 1:3]`, `df["col"]`, `df[df.age > 18]` — всё это вызовы `__getitem__` с разными ключами (блоки 4.1–4.2).
- **`__repr__`** у моделей PyTorch печатает всю архитектуру слоёв — именно так вы будете смотреть на свою сеть.
- **Конфигурации** с `__getitem__`/`__setitem__` позволяют писать `config["lr"]` с проверкой ключей.

## Итоги урока

- Встроенные функции и операторы вызывают специальные методы: `len` → `__len__`, `==` → `__eq__`, `obj[k]` → `__getitem__`, `in` → `__contains__`.
- `__repr__` — всегда, для разработчика; `__str__` — для пользователя, когда нужен особый вид.
- `__eq__` сравнивает поля и возвращает `NotImplemented` для чужих типов; для неизменяемых объектов добавляйте согласованный `__hash__`.
- `__len__` задаёт длину и истинность; `__bool__` — истинность, не связанную с размером.
- `__getitem__` принимает индексы, ключи и срезы; при отсутствии ключа бросайте `KeyError`/`IndexError`.
