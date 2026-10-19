# Шпаргалка: Python изнутри и алгоритмы

## Объекты и ссылки

```python norun
b = a            # не копия! второе имя того же объекта
a is b           # тождество (id(a) == id(b))
a == b           # равенство значений (__eq__)
x is None        # is — только для None, True/False, Enum, маркеров
```

- Аргументы передаются как ссылки: `items.append(x)` в функции видно снаружи, `items = [...]` — нет.
- Операции над неизменяемыми (`str`, `int`, `tuple`) создают новые объекты; `list += ...` меняет список на месте.
- Объект живёт, пока на него есть ссылки; `del name` удаляет имя.

## Копирование

| Способ | Что копирует |
|---|---|
| `list(x)`, `x[:]`, `x.copy()`, `dict(d)`, `{**d}`, `copy.copy(x)` | только внешний контейнер (поверхностно) |
| `copy.deepcopy(x)` | всё рекурсивно (дорого для больших данных) |

- Вложенные списки/словари при поверхностной копии **общие**.
- `[[0] * n] * m` — m ссылок на один список → `[[0] * n for _ in range(m)]`.
- Кортеж со списком внутри: список меняется, кортеж нехешируем.
- Вместо копий — неизменяемость: `tuple`, `frozenset`, frozen-dataclass, `MappingProxyType`.

## Стоимость операций

| Операция | list | dict / set |
|---|---|---|
| доступ `x[i]` / `d[key]` | O(1) | O(1) в среднем |
| `append` / `pop()` | O(1) амортизированно | — |
| `insert(0, x)` / `pop(0)` | O(n) | — |
| `x in ...` | **O(n)** | **O(1)** в среднем |
| `len` | O(1) | O(1) |
| `sort` / `sorted` | O(n log n) | — |

- list — динамический массив ссылок с запасом ёмкости; dict/set — хеш-таблицы (хеш → ячейка, `==` разрешает коллизии).
- Ключи dict/элементы set — хешируемые и неизменные; `a == b` ⇒ `hash(a) == hash(b)`.

## Big O и замеры

O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ)

- Константы и младшие слагаемые отбрасываются; вложенные циклы перемножаются.
- Скрытые циклы: `in list`, `.index`, `.count`, `.remove`, `sorted`, срезы.
- Тест удвоения: O(n) → ×2, O(n²) → ×4.

```python norun
import timeit
timeit.timeit("f(data)", setup="from __main__ import f, data", number=100)
min(timeit.repeat(lambda: f(data), number=10, repeat=5))   # минимум серий
```

```bash
python -m cProfile -s cumulative script.py
```

Сначала профилирование, потом оптимизация.

## Поиск и сортировка

```python norun
import bisect
bisect.bisect_left(a, x)    # первая позиция x (индекс первого ≥ x)
bisect.bisect_right(a, x)   # после последнего x
bisect.insort(a, x)         # вставка с сохранением порядка (O(n) из-за сдвига)
grades[bisect.bisect_right(breakpoints, score)]   # интервал по границам

sorted(items, key=lambda r: (-r.score, r.latency))  # несколько ключей
```

- Бинарный поиск — O(log n), **только по отсортированным** данным; работает и «по ответу» для монотонной проверки.
- Вставками O(n²), слиянием O(n log n); `sorted` — стабильный Timsort.

## collections и heapq

| Инструмент | Для чего |
|---|---|
| `Counter(items)` | частоты; `most_common(k)`; отсутствующий ключ — 0 |
| `defaultdict(list/set/int)` | группировка, индексы (чтение через `[]` создаёт ключ!) |
| `deque(maxlen=n)` | очередь O(1) с обоих концов; последние n элементов |
| `namedtuple("P", ["x", "y"])` | лёгкая неизменяемая запись; `_replace`, `_asdict` |
| `heapq.heappush/heappop` | минимальная куча, O(log n); максимум — `-priority` |
| `heapq.nlargest(k, xs, key=)` | top-k за O(n log k) |

Задачи в куче: `(priority, counter, task)` — счётчик для равных приоритетов.

## GIL, потоки, процессы

| Задача | Инструмент |
|---|---|
| Ожидание (сеть, диск, API) — I/O-bound | `ThreadPoolExecutor`, asyncio |
| Вычисления на чистом Python — CPU-bound | `ProcessPoolExecutor` + `if __name__ == "__main__":` |
| Массивы и тензоры | NumPy/PyTorch (отпускают GIL, параллельны внутри) |

```python norun
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(call_api, prompts))   # порядок сохраняется
```

- GIL: байт-код Python одновременно выполняет один поток процесса; при I/O отпускается.
- Закон Амдала: ускорение ≤ 1 / (1 − p).
- Порядок: алгоритм → векторизация → потоки/процессы.

## Частые ошибки

| Ошибка | Исправление |
|---|---|
| `b = a`, ожидая копию | `list(a)` / `copy.deepcopy(a)` |
| `x is 1000`, `s is "abc"` | `==` |
| Поверхностная копия вложенного конфига | `copy.deepcopy` |
| `x in big_list` в цикле | `set` |
| `pop(0)` для очереди | `deque.popleft()` |
| Сортировка ради top-k | `heapq.nlargest` |
| Бинарный поиск по неотсортированному | отсортировать / `bisect` |
| Потоки для вычислений на Python | процессы |
