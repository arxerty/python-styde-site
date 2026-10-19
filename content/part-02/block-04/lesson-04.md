# Декораторы с аргументами: таймер, retry, кэш

## Зачем декоратору аргументы

Декоратор `@log_calls` из прошлого урока работает всегда одинаково. Но часто поведение нужно настраивать: сколько раз повторять запрос, какие исключения считать временными, сколько секунд ждать между попытками, как называть метрику. Хочется писать так:

```python norun
@retry(attempts=3, delay=1.0)
def call_llm(prompt):
    ...
```

Чтобы понять, как это работает, вспомним правило: `@выражение` над `def f` означает `f = выражение(f)`. Значит, `retry(attempts=3, delay=1.0)` должно **вернуть декоратор** — функцию, которая примет `f`. Получается три уровня вложенности:

1. **фабрика декоратора** `retry(attempts, delay)` — принимает настройки, возвращает декоратор;
2. **декоратор** `decorator(func)` — принимает функцию, возвращает обёртку;
3. **обёртка** `wrapper(*args, **kwargs)` — выполняется при каждом вызове.

## Первый декоратор с аргументом

Начнём с простого: декоратор `repeat(n)` вызывает функцию `n` раз и возвращает список результатов.

```python
from functools import wraps


def repeat(n):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            return [func(*args, **kwargs) for _ in range(n)]
        return wrapper
    return decorator


@repeat(3)
def roll(sides=6):
    return sides


print(roll())
print(roll(20))
print(roll.__name__)
```

```text
[6, 6, 6]
[20, 20, 20]
roll
```

Разберём `@repeat(3)`:

1. сначала вычисляется выражение `repeat(3)` — возвращается `decorator`, который через замыкание помнит `n = 3`;
2. затем `roll = decorator(roll)` — возвращается `wrapper`, который помнит и `func`, и `n`.

Обратите внимание на разницу между `@repeat(3)` (вызов фабрики, затем применение декоратора) и `@repeat` без скобок — во втором случае функция `roll` попала бы в параметр `n`, и всё сломалось бы.

## Таймер

Замер времени выполнения — классический декоратор. Для измерения коротких интервалов используют `time.perf_counter()` — самые точные часы, предназначенные именно для замеров (абсолютное значение ничего не значит, важна только разница).

Сделаем декоратор настраиваемым: имя метки и словарь, куда складывать замеры:

```python
import time
from functools import wraps


def timed(label=None, store=None):
    def decorator(func):
        name = label or func.__name__

        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                return func(*args, **kwargs)
            finally:
                elapsed = time.perf_counter() - start
                if store is not None:
                    store.setdefault(name, []).append(elapsed)
        return wrapper
    return decorator


timings = {}


@timed(label="embedding", store=timings)
def slow_embed(text):
    total = sum(i * i for i in range(200_000))
    return [len(text), total % 7]


slow_embed("a")
slow_embed("bb")
print(list(timings), len(timings["embedding"]))
print(all(t > 0 for t in timings["embedding"]))
```

```text
['embedding'] 2
True
```

Детали, которые стоит заметить:

- `try/finally` гарантирует, что время будет записано, даже если функция бросила исключение, — а результат или исключение пройдут дальше без изменений;
- `name = label or func.__name__` вычисляется один раз при декорировании, а не при каждом вызове;
- конкретные значения времени не печатаем — они разные при каждом запуске и на каждом компьютере; проверяем только, что оба замера записаны и положительны.

## Retry: повторные попытки

Сетевые вызовы иногда падают по временным причинам: перегрузка сервера, превышение лимита запросов, обрыв соединения. Правильная реакция — подождать и повторить. Декоратор `retry` делает это для любой функции:

```python
import time
from functools import wraps


def retry(attempts=3, delay=0.0, exceptions=(Exception,)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as error:
                    if attempt == attempts:
                        raise
                    print(f"попытка {attempt} не удалась: {error}")
                    time.sleep(delay)
        return wrapper
    return decorator


failures = {"left": 2}


@retry(attempts=4, exceptions=(ConnectionError,))
def flaky_request():
    if failures["left"] > 0:
        failures["left"] -= 1
        raise ConnectionError("сервер недоступен")
    return "ответ модели"


print(flaky_request())
```

```text
попытка 1 не удалась: сервер недоступен
попытка 2 не удалась: сервер недоступен
ответ модели
```

Ключевые решения:

- **`exceptions`** — какие ошибки считать временными. Повторять имеет смысл `ConnectionError` или `TimeoutError`, но не `ValueError` из-за неверных аргументов: сколько ни повторяй, результат будет тем же. Исключения, не входящие в кортеж, пролетают сквозь `except` сразу;
- на последней попытке голый `raise` пробрасывает исходное исключение вызывающему коду;
- задержка `delay` в примере нулевая, чтобы не ждать; в реальности — секунды, и обычно она **растёт** с каждой попыткой (экспоненциальная задержка — это мини-проект блока).

Проверим, что не временные ошибки не повторяются:

```python
from functools import wraps


def retry(attempts=3, exceptions=(Exception,)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions:
                    if attempt == attempts:
                        raise
        return wrapper
    return decorator


calls = []


@retry(attempts=5, exceptions=(TimeoutError,))
def parse(text):
    calls.append(text)
    return int(text)


try:
    parse("abc")
except ValueError:
    print("ValueError после", len(calls), "вызова")
```

```text
ValueError после 1 вызова
```

## Кэш: не вычислять дважды

Если функция для одних и тех же аргументов всегда возвращает один и тот же результат (такие функции называют **чистыми**), её результаты можно запоминать. Это **мемоизация** (кэширование):

```python
from functools import wraps


def memoize(func):
    cache = {}

    @wraps(func)
    def wrapper(*args):
        if args not in cache:
            cache[args] = func(*args)
        return cache[args]

    wrapper.cache = cache
    return wrapper


@memoize
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


print(fib(80))
print(len(fib.cache))
```

```text
23416728348467685
81
```

Без кэша `fib(80)` требует триллионы рекурсивных вызовов и не завершится за разумное время; с кэшем каждое значение считается один раз — 81 вызов. Обратите внимание: рекурсивные вызовы `fib(n - 1)` внутри функции тоже идут через обёртку, потому что имя `fib` в модуле уже указывает на неё.

Ограничения простого кэша:

- ключ — кортеж аргументов, поэтому аргументы должны быть **хешируемыми**: со списками и словарями `cache[args]` упадёт с `TypeError`;
- именованные аргументы не поддерживаются (их можно добавить в ключ, например `tuple(sorted(kwargs.items()))`);
- кэш растёт бесконечно — для долгоживущих программ нужен предел размера.

Все эти проблемы решает встроенный `functools.lru_cache` — следующий урок. Но понимать устройство кэша полезно: в LLM-приложениях часто кэшируют ответы модели и эмбеддинги по тексту запроса.

## Декоратор с настройками кэша

Соединим идеи: кэш с параметром — ограничением размера. Когда кэш заполнен, удаляем самую старую запись (словари помнят порядок вставки, блок 1.5):

```python
from functools import wraps


def cached(maxsize=128):
    def decorator(func):
        cache = {}

        @wraps(func)
        def wrapper(*args):
            if args in cache:
                wrapper.hits += 1
                return cache[args]
            wrapper.misses += 1
            result = func(*args)
            if len(cache) >= maxsize:
                oldest = next(iter(cache))
                del cache[oldest]
            cache[args] = result
            return result

        wrapper.hits = 0
        wrapper.misses = 0
        return wrapper
    return decorator


@cached(maxsize=2)
def embed(text):
    return [len(text), text.count(" ")]


for text in ["кот", "пёс", "кот", "ёж", "кот"]:
    embed(text)
print(embed.hits, embed.misses)
```

```text
1 4
```

Проследим: «кот» — промах; «пёс» — промах; «кот» — попадание; «ёж» — промах, кэш полон, вытеснен самый старый — «кот»; «кот» — снова промах. Итого 1 попадание и 4 промаха. Политика «вытеснять самый старый» называется FIFO; `lru_cache` вытесняет давно **не использовавшийся** элемент — это обычно эффективнее.

## Разбор задачи: защищённый вызов модели

Соберём «боевой» вызов LLM из нескольких декораторов: кэш одинаковых запросов, повторные попытки при сбоях и учёт времени. Порядок декораторов здесь принципиален.

```python
import time
from functools import wraps


def retry(attempts=3, exceptions=(Exception,)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions:
                    if attempt == attempts:
                        raise
        return wrapper
    return decorator


def memoize(func):
    cache = {}

    @wraps(func)
    def wrapper(*args):
        if args not in cache:
            cache[args] = func(*args)
        return cache[args]
    return wrapper


def count_calls(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return func(*args, **kwargs)
    wrapper.calls = 0
    return wrapper


server = {"fail_next": True}


@memoize
@retry(attempts=3, exceptions=(ConnectionError,))
@count_calls
def ask_model(prompt):
    if server["fail_next"]:
        server["fail_next"] = False
        raise ConnectionError("503")
    return f"ответ на «{prompt}»"


print(ask_model("Что такое декоратор?"))
print(ask_model("Что такое декоратор?"))
print("обращений к серверу:", ask_model.__wrapped__.__wrapped__.calls)
```

```text
ответ на «Что такое декоратор?»
ответ на «Что такое декоратор?»
обращений к серверу: 2
```

Как это работает, сверху вниз:

- `memoize` — самый внешний: повторный одинаковый запрос вообще не доходит до сервера;
- `retry` внутри кэша: при сбое повторяется **реальное** обращение, а в кэш попадает только успешный результат;
- `count_calls` — ближе всех к функции: считает каждое реальное обращение, включая неудачное. Два обращения — одно упавшее и одно успешное; второй вопрос пользователя обслужил кэш.

Цепочка `__wrapped__` (её добавляет `@wraps`) позволяет добраться до внутренней обёртки со счётчиком. Если поставить `retry` снаружи `memoize`, ничего не сломается, а вот `memoize` внутри `count_calls` спрятал бы от счётчика кэшированные запросы — порядок определяет, кто что «видит».

## Попробуйте сами

- Напишите декоратор `@prefix("[LOG] ")`, добавляющий строку в начало результата функции.
- Добавьте в `retry` параметр `on_retry` — функцию, которая вызывается с номером попытки и исключением (вместо `print`).
- Поменяйте местами `@memoize` и `@retry` в разборе. Что изменится?

## Частые ошибки

**1. `@retry` без скобок у декоратора с аргументами.** Функция попадёт в параметр `attempts`, а декорированное имя станет `decorator`. Пишите `@retry()` или используйте приёмы для «необязательных скобок».

**2. Путаница уровней.** Фабрика возвращает декоратор, декоратор — обёртку. Забыть один `return` — частая ошибка, после которой функция становится `None`.

**3. Повторы при постоянных ошибках.** `retry` для `ValueError` или `KeyError` лишь множит одинаковые неудачи и задерживает ответ. Указывайте только временные исключения.

**4. Кэширование нечистых функций.** Если функция зависит от времени, случайности или внешнего состояния, кэш вернёт устаревший результат.

**5. Нехешируемые аргументы в кэше.** `memoize` с аргументом-списком → `TypeError: unhashable type: 'list'`. Передавайте кортежи или стройте ключ вручную.

**6. Изменяемый общий кэш у разных функций.** Если словарь `cache` создать на уровне фабрики, но вне декоратора, он станет общим для всех функций с этим декоратором — их результаты перемешаются.

## Где это в AI-инженерии

- **Повторы запросов к LLM API**: библиотеки `tenacity` и `backoff` дают декораторы `@retry(stop=..., wait=...)` — промышленная версия того, что вы написали. SDK OpenAI и Anthropic повторяют запросы автоматически при ошибках 429 и 5xx.
- **Кэш ответов модели и эмбеддингов**: одинаковые промпты не оплачиваются дважды; в продакшене кэш хранят в Redis или на диске.
- **Замеры времени**: декораторы-таймеры собирают задержки каждого шага пайплайна RAG — поиск, переранжирование, генерацию.
- **Ограничение частоты**: декоратор `@rate_limit(calls=60, period=60)` защищает от превышения лимитов API.
- **Параметризация тестов**: `@pytest.mark.parametrize("x, y", [...])` — декоратор с аргументами (блок 2.8).

## Итоги урока

- Декоратор с аргументами — три уровня: фабрика(настройки) → декоратор(func) → обёртка(*args, **kwargs).
- `@deco(args)` = `f = deco(args)(f)`; не забывайте скобки.
- Таймер: `time.perf_counter()` и `try/finally`, чтобы время записывалось и при ошибках.
- Retry: повторять только временные исключения, на последней попытке — `raise`.
- Мемоизация: словарь «аргументы → результат» для чистых функций с хешируемыми аргументами.
- Порядок нескольких декораторов определяет, что каждый из них «видит».
