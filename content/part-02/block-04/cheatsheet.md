# Шпаргалка: замыкания, декораторы, контекстные менеджеры

## Функции как объекты

```python norun
f = len                       # без скобок — объект функции
f("abc")                      # со скобками — вызов
handlers = {"mean": mean, "max": max}   # таблица диспетчеризации
handlers[name](values)
sorted(words, key=len)        # функция высшего порядка
callable(obj)                 # можно ли вызвать
```

- `lambda x: x * 2` — только как короткий аргумент; для именованных функций — `def`.
- Объект с `__call__(self, ...)` — вызываемый и может хранить состояние (колбэки, `model(x)`).

## Замыкания и nonlocal

```python norun
def make_counter(start=0):
    count = start                 # захваченная переменная
    def increment(step=1):
        nonlocal count            # нужно для ПРИСВАИВАНИЯ
        count += step
        return count
    return increment              # без скобок

inc = make_counter(10)
inc(); inc()                      # 11, 12 — состояние своё у каждого вызова фабрики
```

- Чтение захваченной переменной и `lst.append(...)` — без `nonlocal`.
- Присваивание без `nonlocal` → `UnboundLocalError`.
- **Позднее связывание**: `[lambda: i for i in range(3)]` — все вернут 2. Исправление: `lambda i=i: i` или фабрика.

## Декоратор

```python norun
from functools import wraps

def log_calls(func):
    @wraps(func)                          # сохранить __name__, __doc__, добавить __wrapped__
    def wrapper(*args, **kwargs):         # любые аргументы
        result = func(*args, **kwargs)    # вызвать исходную
        print(func.__name__, args, result)
        return result                     # вернуть результат!
    return wrapper                        # без скобок

@log_calls            # = add = log_calls(add), один раз при определении
def add(a, b): ...
```

- Несколько декораторов: `@a @b def f` = `f = a(b(f))` — применяются снизу вверх.
- Декоратор-регистратор: записывает функцию в реестр и `return func` без обёртки.
- Состояние: атрибуты обёртки (`wrapper.calls = 0`).

## Декоратор с аргументами

```python norun
def retry(attempts=3, exceptions=(Exception,)):       # 1. фабрика
    def decorator(func):                               # 2. декоратор
        @wraps(func)
        def wrapper(*args, **kwargs):                  # 3. обёртка
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions:
                    if attempt == attempts:
                        raise
        return wrapper
    return decorator

@retry(attempts=5)       # СО скобками — даже без аргументов: @retry()
def call_api(): ...
```

- Таймер: `start = time.perf_counter()` + `try/finally`.
- Retry: только временные исключения; экспоненциальная задержка `base * factor ** (k - 1)`, ограничение `max_delay`, джиттер.
- Для тестируемости передавайте `sleep`, `clock`, `rng` параметрами.

## functools

| Инструмент | Что делает |
|---|---|
| `@lru_cache(maxsize=128)`, `@cache` | мемоизация; `.cache_info()`, `.cache_clear()`; аргументы хешируемые |
| `@cached_property` | свойство, вычисляемое один раз на объект |
| `partial(f, *args, **kw)` | функция с зафиксированными аргументами |
| `reduce(f, xs, initial)` | свёртка в одно значение (указывайте `initial`) |
| `wraps(func)` | метаданные для обёртки |
| `total_ordering` | достроить сравнения по `__eq__` и `__lt__` |

`operator.itemgetter(1)`, `attrgetter("name")`, `operator.add/mul` — вместо простых lambda.

Кэшируйте только **чистые** функции; возвращайте неизменяемые значения (кортежи).

## Контекстные менеджеры

```python norun
class Timer:
    def __enter__(self):                      # результат → as
        self.start = time.perf_counter()
        return self
    def __exit__(self, exc_type, exc, tb):    # вызывается ВСЕГДА
        self.elapsed = time.perf_counter() - self.start
        return False                          # True подавит исключение!

from contextlib import contextmanager

@contextmanager
def temporary(obj, name, value):
    old = getattr(obj, name)
    setattr(obj, name, value)                 # вход
    try:
        yield obj                             # тело with (ровно один yield)
    finally:
        setattr(obj, name, old)               # выход — в finally!
```

- `with a, b:` — вход слева направо, выход в обратном порядке.
- `contextlib.suppress(KeyError)`, `redirect_stdout(buf)`, `nullcontext()`, `ExitStack`.
- Декоратор — на всю функцию; контекстный менеджер — на участок кода и может отдать объект через `as`.

## Частые ошибки

| Ошибка | Симптом | Исправление |
|---|---|---|
| `key=len()` | `TypeError` | `key=len` |
| Присваивание без `nonlocal` | `UnboundLocalError` | `nonlocal x` |
| Функции в цикле видят последнее значение | одинаковые результаты | фабрика или `x=x` |
| Нет `return` в обёртке | функция возвращает `None` | `return func(...)` |
| Нет `@wraps` | `__name__ == "wrapper"` | `@wraps(func)` |
| `@retry` без скобок | функция попала в параметр | `@retry()` |
| `@lru_cache` и список в аргументах | `unhashable type` | кортеж |
| `yield` без `try/finally` | ресурс не освобождается при ошибке | `try: yield ... finally:` |
| `__exit__` возвращает `True` | ошибки молча проглатываются | `return False` |
