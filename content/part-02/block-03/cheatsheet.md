# Шпаргалка: итераторы и генераторы

## Протокол итерации

| Роль | Методы | Пример |
|---|---|---|
| Итерируемый объект | `__iter__` → новый итератор | `list`, `str`, `dict`, `range`, свой класс |
| Итератор | `__next__` (+ `__iter__` → `self`), конец — `StopIteration` | `iter(list)`, `zip`, `map`, `filter`, `enumerate`, файл, генератор |

```python norun
it = iter([1, 2, 3])
next(it)                  # 1
next(it, "конец")         # значение по умолчанию вместо StopIteration
iter(x) is x              # True → x — итератор (одноразовый)
```

`for x in obj` = `it = iter(obj)` + `next(it)` до `StopIteration`.

**Итераторы одноразовые**: второй проход по `zip`, `map`, генератору, файлу — пуст.

## Свой итерируемый класс

```python norun
class Playlist:
    def __init__(self, songs):
        self._songs = list(songs)

    def __iter__(self):           # генератор → многоразовая коллекция
        for song in self._songs:
            yield song
```

Класс-итератор (`__next__` + `__iter__` → `self`) — когда нужны доп. методы/атрибуты (`reset`, `progress`).

## Генераторы

```python norun
def countdown(n):
    while n > 0:
        yield n          # отдать значение и заморозить функцию
        n -= 1
    # конец функции или return → StopIteration

gen = countdown(3)       # тело ещё НЕ выполнялось
list(gen)                # [3, 2, 1]
list(gen)                # [] — одноразовый
```

- Локальные переменные сохраняются между `yield`.
- Бесконечный `while True: yield ...` безопасен при ограниченном потреблении.
- Ошибки и чтение данных происходят при переборе, а не при создании.

## Генераторные выражения

```python norun
(x * x for x in data if x > 0)     # ленивое, одноразовое, ~200 байт
sum(len(w) for w in words)         # без лишних скобок как единственный аргумент
any(check(x) for x in items)       # остановка на первом True
all(valid(r) for r in records)     # остановка на первом False
next((x for x in data if x < 0), None)   # первый подходящий
```

| Ленивые | Немедленные |
|---|---|
| `( ... for ...)`, `range`, `zip`, `map`, `filter`, `enumerate`, файл, `dict.items()` | `[...]`, `{...}`, `{k: v ...}`, `sorted`, `list` |

Генератор — большие/потоковые/одноразовые данные. Список — повторный доступ, `len`, индексы, немедленная проверка.

## yield from и конвейеры

```python norun
def chain_all(*sources):
    for source in sources:
        yield from source           # выдать все элементы по одному

def flatten(items):                 # рекурсивный генератор
    for item in items:
        if isinstance(item, list):
            yield from flatten(item)
        else:
            yield item

pipeline = unique(lowercase(strip_empty(read(lines))))   # источник → звенья → потребитель
```

- Элементы проходят конвейер **по одному**.
- Звено = одна обязанность, принимает итерируемый объект, возвращает итератор.
- `sorted`/`list` внутри звена ломают ленивость.

## itertools

| Функция | Что делает |
|---|---|
| `chain(a, b)`, `chain.from_iterable(xs)` | склейка, развернуть один уровень |
| `islice(it, stop)`, `islice(it, start, stop, step)` | ленивый срез (потребляет итератор) |
| `count(start, step)`, `cycle(xs)`, `repeat(x, n)` | бесконечные (кроме `repeat` с `n`) |
| `groupby(xs, key)` | **подряд идущие** группы → сортируйте заранее; группы — сразу в список |
| `product(a, b)`, `product(xs, repeat=k)` | декартово произведение (сетка параметров) |
| `combinations(xs, k)`, `permutations(xs, k)` | сочетания / размещения |
| `accumulate(xs, func)` | накопленные итоги (`max`, `min`) |
| `takewhile(p, xs)`, `dropwhile(p, xs)` | до первого нарушения / после него |
| `zip_longest(a, b, fillvalue=)`, `pairwise(xs)` | выравнивание длины, соседние пары |
| `batched(xs, n)` (3.12) | кортежи по `n` |

## Батчинг

```python norun
from itertools import islice

def batches(iterable, size, drop_last=False):
    iterator = iter(iterable)              # ОДИН итератор!
    while True:
        batch = list(islice(iterator, size))
        if not batch or (drop_last and len(batch) < size):
            return
        yield batch

def collate(examples):                     # список словарей → словарь списков
    return {k: [e[k] for e in examples] for k in examples[0]}
```

DataLoader: `indices = list(range(len(ds)))` → `rng.shuffle(indices)` в начале **каждой** эпохи (`rng = random.Random(seed)` один раз) → срезы индексов → `collate`. `len(loader)` = ⌈N / batch⌉ (⌊⌋ при `drop_last`).

## Частые ошибки

| Ошибка | Симптом | Исправление |
|---|---|---|
| Повторный проход по итератору | пустой результат | `list(...)` или создать заново |
| `__next__` возвращает `None` в конце | бесконечный цикл | `raise StopIteration` |
| `__iter__` коллекции возвращает `self` | вложенные циклы ломаются | генератор в `__iter__` |
| `len(gen)`, `gen[0]` | `TypeError` | `sum(1 for _ in gen)`, `next(gen)`, `islice` |
| Рекурсия без `yield from` | вложенные элементы теряются | `yield from f(item)` |
| `groupby` без сортировки | дробные группы | `sorted(..., key=k)` |
| `islice(list, n)` в цикле | один и тот же батч | `iterator = iter(list)` |
| `list(count())` | зависание | `islice`, `zip`, `takewhile` |
