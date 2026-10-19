# Перегрузка операторов: класс Vector

## Зачем свои операторы

Векторы — основа машинного обучения: признаки объекта, веса модели, эмбеддинги текстов — всё это векторы чисел. Сложить два вектора в части 1 можно было так: `[a + b for a, b in zip(v1, v2)]`. Работает, но формулы из учебника по линейной алгебре превращаются в нечитаемую кашу. Сравните:

```python norun
# на списках
result = [x + 2 * y for x, y in zip(position, [s * dt for s in speed])]
# с перегруженными операторами
result = position + 2 * speed * dt
```

**Перегрузка операторов** — возможность задать, что делают `+`, `-`, `*`, `==`, `<` и другие операторы для объектов вашего класса. Механизм тот же, что в прошлом уроке: оператор вызывает специальный метод. В этом уроке шаг за шагом построим класс `Vector` — упрощённую версию того, что делают NumPy и PyTorch.

## Таблица арифметических операторов

| Выражение | Метод | Отражённый метод |
|---|---|---|
| `a + b` | `a.__add__(b)` | `b.__radd__(a)` |
| `a - b` | `a.__sub__(b)` | `b.__rsub__(a)` |
| `a * b` | `a.__mul__(b)` | `b.__rmul__(a)` |
| `a / b` | `a.__truediv__(b)` | `b.__rtruediv__(a)` |
| `a // b` | `a.__floordiv__(b)` | `b.__rfloordiv__(a)` |
| `a @ b` | `a.__matmul__(b)` | `b.__rmatmul__(a)` |
| `-a` | `a.__neg__()` | — |
| `abs(a)` | `a.__abs__()` | — |

Что такое «отражённый» метод, разберём чуть ниже.

## Сложение и вычитание

```python
class Vector:
    def __init__(self, *components):
        self.components = tuple(components)

    def __repr__(self):
        return f"Vector{self.components}"

    def __len__(self):
        return len(self.components)

    def __add__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        if len(self) != len(other):
            raise ValueError("векторы разной размерности")
        return Vector(*(a + b for a, b in zip(self.components, other.components)))

    def __sub__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        if len(self) != len(other):
            raise ValueError("векторы разной размерности")
        return Vector(*(a - b for a, b in zip(self.components, other.components)))


a = Vector(1, 2, 3)
b = Vector(10, 20, 30)
print(a + b)
print(b - a)
print(a)
```

```text
Vector(11, 22, 33)
Vector(9, 18, 27)
Vector(1, 2, 3)
```

Три важных принципа:

1. **Оператор возвращает новый объект**, а не меняет существующие. После `a + b` вектор `a` остался прежним — так же, как `x + y` не меняет числа. Компоненты хранятся в кортеже, поэтому объект фактически неизменяемый.
2. **Чужой тип → `NotImplemented`.** Для `Vector(1, 2) + "abc"` Python получит `NotImplemented`, попробует отражённый метод строки и, не найдя решения, бросит понятный `TypeError: unsupported operand type(s)`.
3. **Ошибка в данных → исключение.** Векторы разной длины — это ошибка в данных, а не «неподдерживаемый тип», поэтому `ValueError`.

Обратите внимание на `*components` в `__init__` и `Vector(*(...))` при создании: звёздочка распаковывает генератор в отдельные аргументы (блок 1.6).

## Умножение на число и отражённые методы

Умножение вектора на число растягивает его: `Vector(1, 2) * 3` → `Vector(3, 6)`. Добавим `__mul__`:

```python
class Vector:
    def __init__(self, *components):
        self.components = tuple(components)

    def __repr__(self):
        return f"Vector{self.components}"

    def __mul__(self, scalar):
        if not isinstance(scalar, (int, float)):
            return NotImplemented
        return Vector(*(c * scalar for c in self.components))


v = Vector(1, 2)
print(v * 3)
try:
    print(3 * v)
except TypeError as error:
    print("Ошибка:", error)
```

```text
Vector(3, 6)
Ошибка: unsupported operand type(s) for *: 'int' and 'Vector'
```

`v * 3` работает, а `3 * v` — нет. Почему? Для `3 * v` Python сначала вызывает `(3).__mul__(v)`: целое число не знает про векторы и возвращает `NotImplemented`. Тогда Python пробует **отражённый** (reflected) метод правого операнда: `v.__rmul__(3)`. Его нет — ошибка.

Добавляем `__rmul__`. Умножение на число коммутативно, поэтому достаточно переиспользовать `__mul__`:

```python
class Vector:
    def __init__(self, *components):
        self.components = tuple(components)

    def __repr__(self):
        return f"Vector{self.components}"

    def __mul__(self, scalar):
        if not isinstance(scalar, (int, float)):
            return NotImplemented
        return Vector(*(c * scalar for c in self.components))

    def __rmul__(self, scalar):
        return self * scalar

    def __truediv__(self, scalar):
        if not isinstance(scalar, (int, float)):
            return NotImplemented
        return self * (1 / scalar)

    def __neg__(self):
        return self * -1


v = Vector(2, 4)
print(3 * v, v / 2, -v)
```

```text
Vector(6, 12) Vector(1.0, 2.0) Vector(-2, -4)
```

Порядок поиска для `a OP b`: сначала `a.__op__(b)`; если метода нет или он вернул `NotImplemented` — `b.__rop__(a)`; если и это не помогло — `TypeError`. Именно поэтому важно возвращать `NotImplemented`, а не бросать исключение сразу: вы даёте шанс другому объекту.

## Длина вектора и скалярное произведение

Два ключевых понятия линейной алгебры (подробно — в части 3):

- **Норма** (длина) вектора: √(x₁² + x₂² + …). Естественно сделать её через `abs(v)` — как модуль числа.
- **Скалярное произведение** (dot product): x₁·y₁ + x₂·y₂ + … В Python для матричного умножения есть специальный оператор `@` (метод `__matmul__`) — NumPy использует его и для векторов.

```python
import math


class Vector:
    def __init__(self, *components):
        self.components = tuple(components)

    def __repr__(self):
        return f"Vector{self.components}"

    def __abs__(self):
        return math.sqrt(sum(c * c for c in self.components))

    def __matmul__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return sum(a * b for a, b in zip(self.components, other.components))


v = Vector(3, 4)
w = Vector(1, 2)
print(abs(v))
print(v @ w)
```

```text
5.0
11
```

## Сравнения

Операторы сравнения тоже перегружаются: `__eq__` (`==`), `__ne__` (`!=`), `__lt__` (`<`), `__le__` (`<=`), `__gt__` (`>`), `__ge__` (`>=`). Определять все шесть утомительно. Модуль `functools` предлагает декоратор `@total_ordering`: определите `__eq__` и один из `__lt__`/`__le__`/`__gt__`/`__ge__`, и он достроит остальные. Подробно о декораторах — в блоке 2.4, здесь достаточно им воспользоваться.

```python
from functools import total_ordering


@total_ordering
class Score:
    def __init__(self, model, value):
        self.model = model
        self.value = value

    def __eq__(self, other):
        if not isinstance(other, Score):
            return NotImplemented
        return self.value == other.value

    def __lt__(self, other):
        if not isinstance(other, Score):
            return NotImplemented
        return self.value < other.value

    def __repr__(self):
        return f"Score({self.model!r}, {self.value})"


scores = [Score("bert", 0.91), Score("tfidf", 0.84), Score("gpt", 0.95)]
print(max(scores))
print(sorted(scores))
print(Score("a", 0.5) >= Score("b", 0.5))
```

```text
Score('gpt', 0.95)
[Score('tfidf', 0.84), Score('bert', 0.91), Score('gpt', 0.95)]
True
```

Определив `__lt__`, вы получаете работающие `sorted`, `min`, `max` без параметра `key` — они используют `<`. Для векторов отношение «меньше» математически не определено, поэтому Vector сравнения не получит: не перегружайте операторы там, где их смысл неочевиден.

## Составное присваивание: +=

Для `a += b` Python ищет `__iadd__` («in-place add»). Если его нет, выполняется `a = a + b` через `__add__`. Для неизменяемых объектов (как наш Vector, как числа и строки) этого достаточно: `+=` создаёт новый объект и связывает с ним имя.

```python
class Vector:
    def __init__(self, *components):
        self.components = tuple(components)

    def __repr__(self):
        return f"Vector{self.components}"

    def __add__(self, other):
        return Vector(*(a + b for a, b in zip(self.components, other.components)))


v = Vector(1, 1)
original = v
v += Vector(2, 3)
print(v, original, v is original)
```

```text
Vector(3, 4) Vector(1, 1) False
```

`__iadd__` определяют изменяемые типы, которым выгодно менять себя на месте: так `list += [...]` дописывает элементы в тот же список. Для своего неизменяемого класса `__iadd__` не нужен.

## sum() и __radd__

Встроенная `sum` начинает с `0`, поэтому `sum([v1, v2])` вычисляет `0 + v1` — и падает, если вектор не умеет складываться с нулём. Есть два решения: передать начальное значение `sum(vectors, Vector(0, 0))` или научить `__radd__` принимать 0:

```python
class Vector:
    def __init__(self, *components):
        self.components = tuple(components)

    def __repr__(self):
        return f"Vector{self.components}"

    def __add__(self, other):
        if not isinstance(other, Vector):
            return NotImplemented
        return Vector(*(a + b for a, b in zip(self.components, other.components)))

    def __radd__(self, other):
        if other == 0:
            return self
        return NotImplemented


print(sum([Vector(1, 2), Vector(3, 4), Vector(5, 6)]))
```

```text
Vector(9, 12)
```

## Разбор задачи: поиск похожих текстов по эмбеддингам

Языковые модели превращают текст в **эмбеддинг** — вектор, в котором похожие по смыслу тексты оказываются «рядом». Меру сходства обычно считают как **косинусное сходство**: `(a @ b) / (|a| · |b|)` — от −1 (противоположны) до 1 (одинаково направлены). На этом построен семантический поиск и RAG (блок 7.3).

```python
import math


class Vector:
    def __init__(self, *components):
        self.components = tuple(components)

    def __repr__(self):
        return f"Vector{self.components}"

    def __abs__(self):
        return math.sqrt(sum(c * c for c in self.components))

    def __matmul__(self, other):
        return sum(a * b for a, b in zip(self.components, other.components))

    def cosine(self, other):
        return (self @ other) / (abs(self) * abs(other))


documents = {
    "рецепт борща": Vector(0.9, 0.1, 0.0),
    "обучение нейросети": Vector(0.0, 0.8, 0.6),
    "Python для ML": Vector(0.1, 0.6, 0.8),
}
query = Vector(0.0, 0.7, 0.7)
ranked = sorted(documents, key=lambda name: query.cosine(documents[name]), reverse=True)
for name in ranked:
    print(f"{query.cosine(documents[name]):.3f}  {name}")
```

```text
0.990  обучение нейросети
0.985  Python для ML
0.078  рецепт борща
```

Формула косинусного сходства записана почти как в учебнике: `(self @ other) / (abs(self) * abs(other))`. Настоящие эмбеддинги имеют сотни и тысячи компонент, и считают их в NumPy, но устройство то же самое: NumPy-массив — это класс с перегруженными `+`, `*`, `@` и `abs`.

## Попробуйте сами

- Добавьте в `Vector` метод `__eq__` и проверьте `Vector(1, 2) == Vector(1, 2)`.
- Реализуйте `normalized()` — вектор той же направленности длины 1 (`self / abs(self)`).
- Что выведет `Vector(1, 2) * Vector(3, 4)` в версии с `__mul__`? Почему именно такая ошибка?

## Частые ошибки

**1. Изменение операндов в операторе.** `__add__`, меняющий `self` и возвращающий его, ломает ожидания: после `c = a + b` неожиданно меняется `a`. Возвращайте новый объект.

**2. Забытый `__rmul__`/`__radd__`.** `v * 3` работает, а `3 * v` и `sum(vectors)` — нет.

**3. `raise TypeError` вместо `return NotImplemented`.** Лишает другой операнд шанса обработать операцию; Python сам сформирует понятную ошибку, если никто не справится.

**4. Неочевидный смысл оператора.** `vector1 < vector2` или `user + order` — читатель не поймёт, что происходит. Перегружайте операторы, только когда их смысл совпадает с математическим или общепринятым.

**5. Тихая обработка разной размерности.** `zip` молча обрезает по короткому вектору, и ошибка в данных проходит незамеченной. Проверяйте размерность явно.

**6. Забытый `return`.** Метод оператора без `return` вернёт `None`, и `a + b` молча даст `None`.

## Где это в AI-инженерии

- **NumPy и PyTorch** перегружают все арифметические операторы: `X @ W + b` — это вызовы `__matmul__` и `__add__` у массивов и тензоров (блоки 4.1, 6.1).
- **Эмбеддинги**: косинусное сходство — основа семантического поиска, рекомендаций и RAG.
- **pandas**: `df["price"] * 1.2`, `df["a"] + df["b"]` — перегруженные операторы столбцов; сравнения `df.age > 18` возвращают маски для фильтрации.
- **Автоматическое дифференцирование**: PyTorch перехватывает каждый `+` и `*`, записывая граф вычислений для обратного распространения ошибки (блок 6.1) — именно перегрузка операторов делает это незаметным.
- **Метрики**: классы метрик с `__lt__` позволяют выбирать лучшую модель через `max(results)`.

## Итоги урока

- Операторы вызывают специальные методы: `+` → `__add__`, `*` → `__mul__`, `@` → `__matmul__`, `-x` → `__neg__`, `abs()` → `__abs__`.
- Оператор возвращает новый объект и не меняет операнды.
- Для чужого типа возвращайте `NotImplemented` — тогда Python попробует отражённый метод `__rop__` правого операнда.
- `__rmul__`/`__radd__` нужны для `3 * v` и `sum(vectors)`.
- `@total_ordering` достраивает сравнения по `__eq__` и `__lt__`; `+=` без `__iadd__` работает через `__add__`.
- Перегружайте операторы только там, где их смысл очевиден.
