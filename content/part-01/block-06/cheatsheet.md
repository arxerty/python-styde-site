# Шпаргалка: функции

## Определение и вызов

```python norun
def average(numbers):
    """Вернуть среднее или None для пустого списка."""
    if not numbers:
        return None            # ранний возврат
    return sum(numbers) / len(numbers)

result = average([5, 4])       # вызов — со скобками
f = average                    # сама функция — без скобок
```

- Нет `return` → функция возвращает `None`. Вычисляющая функция **возвращает**, а не печатает.
- `return a, b` → кортеж; `return` во вложенных циклах выходит из функции сразу.
- Аргументы передаются ссылками: изменяемый объект можно изменить внутри.

## Параметры

```python norun
def f(a, b=2, *args, flag=False, **kwargs): ...
#     обяз. умолч.  остаток   только по имени  остальные именованные
def g(x, *, option=1): ...     # после * — только по имени
f(1, b=5)                      # сначала позиционные, потом именованные
f(*[1, 2], **{"flag": True})   # распаковка при вызове
```

**Ловушка:** `def f(items=[])` — список общий для всех вызовов. Правильно:

```python norun
def f(items=None):
    if items is None:
        items = []
```

## Области видимости (LEGB)

Local → Enclosing → Global → Built-in.

- Присваивание внутри функции делает имя локальным → `UnboundLocalError` при чтении до присваивания.
- `global x` / `nonlocal x` — перепривязать внешнее имя (используйте редко).
- Не затеняйте встроенные имена: `list`, `sum`, `max`, `id`, `type`.

```python norun
def make_counter():
    count = 0
    def tick():
        nonlocal count
        count += 1
        return count
    return tick                # замыкание
```

## lambda, map, filter, key

```python norun
sorted(items, key=lambda s: (-s["score"], s["name"]))
max(words, key=len)
list(map(int, "1 2 3".split()))
list(filter(None, strings))    # убрать пустые
ops = {"+": lambda a, b: a + b}  # словарь функций
```

С lambda обычно понятнее comprehension: `[x * 2 for x in data if x > 0]`.

## Рекурсия

```python norun
def factorial(n):
    if n <= 1:                 # базовый случай
        return 1
    return n * factorial(n - 1)  # шаг к базовому случаю
```

- Предел глубины ~1000 → `RecursionError`.
- Для вложенных структур (JSON, деревья) — рекурсия; для линейных задач — цикл.
- Повторные вычисления — мемоизация (кэш-словарь, `lru_cache`).

## Структура программы

```python norun
"""Docstring модуля."""
import ...
CONSTANT = ...

def helper(): ...
def main(): ...

if __name__ == "__main__":
    main()
```

Хорошая функция: одна задача, говорящее имя (глагол), короткая, мало параметров, без `print` и `input` внутри логики.

## Частые ошибки

- `print` вместо `return`; не все ветки возвращают значение.
- `key=len()` вместо `key=len`.
- Изменяемое значение по умолчанию.
- Рекурсия без базового случая или без `return` в шаге.
