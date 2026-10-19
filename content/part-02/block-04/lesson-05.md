# functools: lru_cache, partial, reduce

## Модуль для работы с функциями

Модуль `functools` из стандартной библиотеки содержит инструменты для функций высшего порядка. Один из них вы уже знаете — `wraps`. В этом уроке разберём ещё несколько, которые встречаются в коде постоянно:

- `lru_cache` и `cache` — готовая мемоизация;
- `cached_property` — кэшируемое свойство объекта;
- `partial` — функция с зафиксированной частью аргументов;
- `reduce` — свёртка последовательности в одно значение.

А в конце посмотрим на модуль `operator`, который часто используется вместе с ними.

## lru_cache: мемоизация из коробки

В прошлом уроке вы написали свой LRU-кэш. В стандартной библиотеке он уже есть — быстрый (написан на C), потокобезопасный и со статистикой:

```python
from functools import lru_cache


@lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


print(fib(100))
print(fib.cache_info())
```

```text
354224848179261915075
CacheInfo(hits=98, misses=101, maxsize=None, currsize=101)
```

- `maxsize=None` — кэш без ограничения размера; число (по умолчанию 128) — ограничение с вытеснением давно не использовавшихся записей;
- `cache_info()` — статистика: попадания, промахи, лимит и текущий размер;
- `cache_clear()` — очистить кэш.

С Python 3.9 есть короткая запись для безлимитного кэша — `@cache` (то же, что `@lru_cache(maxsize=None)`):

```python
from functools import cache

calls = []


@cache
def normalize(text):
    calls.append(text)
    return " ".join(text.lower().split())


for query in ["Что  такое RAG?", "что такое rag?", "Что  такое RAG?"]:
    normalize(query)
print(len(calls), normalize.cache_info().hits)
```

```text
2 1
```

Третий запрос совпал с первым буквально и взят из кэша. Второй — другая строка (хотя нормализуется так же), поэтому вычислялся заново: кэш сравнивает **аргументы**, а не результаты.

## Аргументы должны быть хешируемыми

`lru_cache` использует аргументы как ключ словаря. Поэтому все аргументы должны быть хешируемыми: числа, строки, кортежи — можно; списки, словари, множества — нельзя:

```python
from functools import lru_cache


@lru_cache
def total(values):
    return sum(values)


print(total((1, 2, 3)))
try:
    total([1, 2, 3])
except TypeError as error:
    print("ошибка:", error)
```

```text
6
ошибка: unhashable type: 'list'
```

Обратите внимание: `@lru_cache` без скобок тоже работает — это сделано специально для удобства (используется размер по умолчанию 128).

Типичное решение — преобразовывать изменяемые аргументы в кортежи перед вызовом кэшируемой функции или кэшировать функцию, которая принимает только неизменяемые данные (например, текст запроса, а не объект запроса).

## Кэш и методы: cached_property

Применять `@lru_cache` к методам класса нужно осторожно: `self` становится частью ключа, и кэш хранит ссылки на объекты, не давая сборщику мусора их удалить. Для «дорогого вычисления, которое для объекта делается один раз» есть `cached_property` — свойство, которое вычисляется при первом обращении и сохраняется в объекте:

```python
from functools import cached_property


class Document:
    def __init__(self, text):
        self.text = text

    @cached_property
    def tokens(self):
        print("токенизирую...")
        return self.text.lower().split()

    @property
    def size(self):
        return len(self.tokens)


doc = Document("Кэширование экономит время и деньги")
print(doc.size)
print(doc.tokens[:2])
print("tokens" in vars(doc))
```

```text
токенизирую...
5
['кэширование', 'экономит']
True
```

«токенизирую...» напечатано один раз: результат первого вычисления записан в атрибут экземпляра `tokens`, и дальше обращение идёт к нему напрямую. Если текст документа может меняться, `cached_property` не подходит — кэш устареет.

## partial: зафиксировать аргументы

`partial(func, *args, **kwargs)` создаёт новую функцию, в которой часть аргументов `func` уже подставлена:

```python
from functools import partial


def power(base, exponent):
    return base ** exponent


square = partial(power, exponent=2)
cube = partial(power, exponent=3)
two_to = partial(power, 2)

print(square(5), cube(2), two_to(10))
print(square.func.__name__, square.keywords)
```

```text
25 8 1024
power {'exponent': 2}
```

- `partial(power, exponent=2)` фиксирует именованный аргумент;
- `partial(power, 2)` фиксирует первый позиционный (`base = 2`);
- у объекта `partial` есть атрибуты `func`, `args` и `keywords` — видно, что зафиксировано.

Это можно сделать и через lambda: `square = lambda b: power(b, 2)`. Но `partial` нагляднее говорит о намерении, сохраняет ссылку на исходную функцию и не страдает от позднего связывания в циклах (урок 2): значения фиксируются в момент создания.

Особенно удобен `partial`, когда функцию с настройками нужно передать туда, где её вызовут с одним аргументом: в `map`, `sorted(key=...)`, колбэки, обработчики:

```python
from functools import partial


def clip(value, low, high):
    return max(low, min(high, value))


scores = [1.7, -0.3, 0.42, 0.99]
print(list(map(partial(clip, low=0.0, high=1.0), scores)))

print_error = partial(print, "[ERROR]", sep=" | ")
print_error("диск заполнен", "код 28")
```

```text
[1.0, 0.0, 0.42, 0.99]
[ERROR] | диск заполнен | код 28
```

Даже встроенную `print` можно «настроить» с помощью `partial`.

## reduce: свёртка

`reduce(func, iterable, initial)` последовательно «сворачивает» элементы в одно значение: берёт аккумулятор и очередной элемент, вызывает `func(аккумулятор, элемент)`, результат становится новым аккумулятором.

```python
from functools import reduce


def step(acc, x):
    print(f"acc={acc}, x={x} → {acc * x}")
    return acc * x


print(reduce(step, [2, 3, 4], 1))
```

```text
acc=1, x=2 → 2
acc=2, x=3 → 6
acc=6, x=4 → 24
24
```

Без начального значения `initial` первым аккумулятором становится первый элемент; для пустой последовательности без `initial` будет `TypeError`. Поэтому `initial` лучше указывать.

Где `reduce` действительно полезен — там, где нет готовой встроенной функции. Например, слияние словарей конфигураций, где более поздние перекрывают ранние, или применение цепочки функций:

```python
from functools import reduce

defaults = {"model": "small", "lr": 0.001, "epochs": 10}
from_file = {"model": "large", "epochs": 3}
from_cli = {"lr": 0.01}

config = reduce(lambda acc, part: {**acc, **part}, [defaults, from_file, from_cli], {})
print(config)

steps = [str.strip, str.lower, lambda s: s.replace(" ", "_")]
print(reduce(lambda value, func: func(value), steps, "  Model Name  "))
```

```text
{'model': 'large', 'lr': 0.01, 'epochs': 3}
model_name
```

Предупреждение: `reduce` легко сделать нечитаемым. Для суммы есть `sum`, для произведения — `math.prod`, для максимума — `max`, для склейки строк — `str.join`, для «все/хотя бы один» — `all`/`any`. Используйте их, а `reduce` — только когда готового инструмента нет и обычный цикл получается длиннее.

## Модуль operator

Модуль `operator` содержит операторы Python в виде функций: `operator.add(a, b)` — то же, что `a + b`. Это избавляет от однотипных lambda при работе с `reduce`, `sorted`, `map`:

```python
import operator
from functools import reduce

print(reduce(operator.mul, [1, 2, 3, 4], 1))

results = [("bert", 0.91, 120), ("tfidf", 0.84, 3), ("gpt", 0.95, 900)]
print(sorted(results, key=operator.itemgetter(2)))
print(list(map(operator.itemgetter(0), results)))
print(max(results, key=operator.itemgetter(1))[0])
```

```text
24
[('tfidf', 0.84, 3), ('bert', 0.91, 120), ('gpt', 0.95, 900)]
['bert', 'tfidf', 'gpt']
gpt
```

- `operator.itemgetter(i)` — функция, возвращающая `obj[i]` (то же, что `lambda obj: obj[i]`); с несколькими индексами возвращает кортеж;
- `operator.attrgetter("name")` — функция, возвращающая `obj.name`;
- `operator.add`, `mul`, `sub`, `truediv`, `eq`, `lt` и другие — операторы.

## Разбор задачи: кэш эмбеддингов и настройка вызовов модели

Соберём инструменты урока вместе. Нужно вычислять «эмбеддинги» текстов (дорогая операция), не повторяя вычисления для одинаковых текстов, и вызывать модель с разными зафиксированными настройками.

```python
from functools import lru_cache, partial, reduce
import operator

model_calls = []


@lru_cache(maxsize=1000)
def embed(text):
    model_calls.append(text)
    return tuple(text.count(ch) for ch in "аеиоу")


def similarity(a, b):
    return sum(map(operator.mul, embed(a), embed(b)))


def generate(prompt, temperature, max_tokens):
    return f"[t={temperature}, max={max_tokens}] {prompt[:20]}"


precise = partial(generate, temperature=0.0, max_tokens=50)
creative = partial(generate, temperature=1.2, max_tokens=500)

query = "кошка сидит на окне"
docs = ["собака бежит", "кошка спит на диване", "кот на окне"]
best = max(docs, key=partial(similarity, query))
print(best)
print(len(model_calls), embed.cache_info().hits)
print(precise("Кратко: что такое кэш?"))
print(creative("Сочини стих про кэш"))
total_tokens = reduce(operator.add, (len(d.split()) for d in docs), 0)
print(total_tokens)
```

```text
кошка спит на диване
4 2
[t=0.0, max=50] Кратко: что такое кэ
[t=1.2, max=500] Сочини стих про кэш
9
```

Разбор:

- `lru_cache` превращает повторные эмбеддинги в бесплатные: эмбеддинг запроса нужен для каждого из трёх документов, но вычислен один раз — четыре реальных вызова (запрос и три документа) и два попадания в кэш. Результат — кортеж, а не список, чтобы его нельзя было случайно изменить в кэше;
- `partial(similarity, query)` фиксирует первый аргумент и даёт функцию одного аргумента для `key=`;
- `precise` и `creative` — две «настроенные» версии одной функции генерации, их удобно передавать дальше по коду;
- `operator.mul` в `map` перемножает компоненты векторов, а `reduce(operator.add, ...)` суммирует — хотя здесь честнее было бы написать `sum(...)`.

## Попробуйте сами

- Посчитайте `fib(300)` с `@cache` и без него (без кэша — осторожно, с небольшим `n`!).
- Создайте `partial(sorted, key=len, reverse=True)` и примените к списку слов.
- Перепишите слияние конфигураций без `reduce` — обычным циклом. Какой вариант понятнее?

## Частые ошибки

**1. Кэширование функций с изменяемыми аргументами.** `TypeError: unhashable type`. Передавайте кортежи и строки.

**2. Кэширование нечистых функций.** Функция, читающая время, файл или внешнее состояние, вернёт устаревший результат из кэша.

**3. Изменяемый результат в кэше.** Если кэшированная функция возвращает список, и вызывающий код его меняет, изменится и значение в кэше — следующие вызовы получат испорченные данные. Возвращайте кортежи.

**4. `lru_cache` на методах долгоживущих объектов.** Кэш держит ссылки на `self` — объекты не освобождаются из памяти. Используйте `cached_property` или кэш внутри объекта.

**5. `reduce` без начального значения.** На пустой последовательности — `TypeError`. Указывайте `initial`.

**6. `reduce` вместо встроенных функций.** `reduce(lambda a, b: a + b, nums)` — пишите `sum(nums)`; это быстрее и понятнее.

## Где это в AI-инженерии

- **Кэширование загрузки моделей и токенизаторов**: функция `get_model()` с `@lru_cache` гарантирует, что тяжёлая модель загрузится один раз на процесс, — частый приём в FastAPI-сервисах (часть 8).
- **Кэш эмбеддингов и ответов**: одинаковые тексты не отправляются в API повторно.
- **`partial`** для настройки функций: `partial(tokenizer, truncation=True, max_length=512)` передаётся в `dataset.map`; функции потерь и метрики с фиксированными параметрами передаются в цикл обучения.
- **`cached_property`** в классах датасетов и документов: словарь токенов, статистики, индексы вычисляются по требованию один раз.
- **`reduce`** для слияния слоёв конфигурации (значения по умолчанию → файл → командная строка) и композиции преобразований.

## Итоги урока

- `@lru_cache(maxsize=...)` и `@cache` — встроенная мемоизация; `cache_info()`, `cache_clear()`; аргументы должны быть хешируемыми.
- `@cached_property` — свойство, вычисляемое один раз на объект.
- `partial(func, *args, **kwargs)` — функция с зафиксированными аргументами; удобна для `key=`, `map` и колбэков.
- `reduce(func, iterable, initial)` — свёртка в одно значение; используйте, только когда нет встроенной альтернативы.
- `operator.itemgetter`, `attrgetter`, `add`, `mul` заменяют простые lambda.
