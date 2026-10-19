# Type hints: базовые типы, list[int], dict[str, float]

## Зачем указывать типы в динамическом языке

Python — язык с **динамической типизацией**: переменная может хранить значение любого типа, и тип проверяется только во время выполнения. Это удобно для коротких скриптов, но в больших проектах приводит к типичным вопросам:

- что принимает функция `process(data)` — строку, список строк, словарь?
- что она возвращает — число или `None`, если ничего не нашла?
- можно ли передать сюда `numpy`-массив вместо списка?

Ответы приходится искать в документации (если она есть) или читать код функции целиком. А ошибка «передал строку вместо списка» проявится только при запуске, и, возможно, не сразу.

**Аннотации типов** (type hints) — способ записать ожидаемые типы прямо в коде:

```python
def average_score(scores: list[float]) -> float:
    return sum(scores) / len(scores)


print(average_score([0.8, 0.9, 1.0]))
```

```text
0.9
```

`scores: list[float]` читается как «параметр scores — список чисел с плавающей точкой», а `-> float` — «функция возвращает float». Аннотации появились в Python 3.5 и с тех пор стали стандартом: их используют почти все современные библиотеки.

Что они дают:

- **документацию**, которая не устаревает отдельно от кода;
- **подсказки редактора**: автодополнение методов, подсветку ошибок до запуска;
- **статическую проверку** анализаторами вроде mypy (урок 4) — целые классы ошибок ловятся без запуска программы;
- **проверку и преобразование данных во время выполнения** библиотеками вроде Pydantic (уроки 5–6) и FastAPI (часть 8), которые читают аннотации.

## Аннотации не проверяются при выполнении

Важнейший факт, который нужно понять сразу: сам Python аннотации **не проверяет**. Это подсказки для людей и инструментов, а не ограничения:

```python
def repeat(text: str, times: int) -> str:
    return text * times


print(repeat("ab", 3))
print(repeat([1, 2], 2))
```

```text
ababab
[1, 2, 1, 2]
```

Второй вызов нарушает аннотацию (передан список вместо строки), но Python выполнил его без ошибок. Найти такую ошибку — задача анализатора типов, а проверить данные во время работы — задача валидации (Pydantic). Аннотации — это контракт, а не охранник.

## Синтаксис аннотаций

Аннотировать можно параметры функции, возвращаемое значение и переменные:

```python
def greet(name: str, excited: bool = False) -> str:
    suffix = "!" if excited else "."
    return f"Привет, {name}{suffix}"


def log_message(message: str) -> None:
    print(f"[log] {message}")


max_tokens: int = 512
temperature: float = 0.7
model_name: str = "mini"

print(greet("Ада", excited=True))
log_message("готово")
```

```text
Привет, Ада!
[log] готово
```

- **Параметр**: `имя: тип`; со значением по умолчанию — `имя: тип = значение` (пробелы вокруг `=` здесь ставятся, в отличие от параметра без аннотации — так требует PEP 8).
- **Возвращаемое значение**: `-> тип` перед двоеточием. Если функция ничего не возвращает, пишут `-> None`.
- **Переменная**: `имя: тип = значение`. Для переменных аннотации нужны реже — анализатор обычно сам выводит тип из значения.

## Базовые типы

Встроенные типы используются в аннотациях напрямую: `int`, `float`, `str`, `bool`, `bytes`, `None`.

```python
def describe(count: int, ratio: float, label: str, active: bool) -> str:
    return f"{label}: {count} шт., доля {ratio:.0%}, активно: {active}"


print(describe(42, 0.25, "тексты", True))
print(describe(42, 1, "тексты", True))
```

```text
тексты: 42 шт., доля 25%, активно: True
тексты: 42 шт., доля 100%, активно: True
```

Правило удобства: там, где ожидается `float`, анализаторы типов принимают и `int` — целое число всегда можно использовать как дробное. Поэтому `ratio: float` подходит и для `1`.

## Типы коллекций: list[int], dict[str, float]

Для коллекций указывают и тип самой коллекции, и тип элементов в квадратных скобках:

```python
def count_words(texts: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for text in texts:
        for word in text.lower().split():
            counts[word] = counts.get(word, 0) + 1
    return counts


def normalize(scores: dict[str, float]) -> dict[str, float]:
    total = sum(scores.values())
    return {name: round(value / total, 3) for name, value in scores.items()}


print(count_words(["Кот спит", "кот ест"]))
print(normalize({"bert": 3.0, "gpt": 1.0}))
```

```text
{'кот': 2, 'спит': 1, 'ест': 1}
{'bert': 0.75, 'gpt': 0.25}
```

| Аннотация | Значение |
|---|---|
| `list[int]` | список целых чисел |
| `dict[str, float]` | словарь: ключи-строки, значения-дробные |
| `set[str]` | множество строк |
| `tuple[int, str]` | кортеж ровно из двух элементов: int и str |
| `tuple[float, ...]` | кортеж любой длины из float |
| `list[dict[str, int]]` | список словарей — вложенность любая |

Как выбрать уровень детализации? Аннотация должна быть настолько точной, насколько это полезно читателю и анализатору. `dict[str, float]` для словаря метрик гораздо информативнее голого `dict`. Если же словарь хранит значения разных типов с известными ключами (например, конфигурацию с числами и строками), его лучше описать специальным типом TypedDict — об этом в уроке 3.

Обратите внимание на кортежи: `tuple[int, str]` описывает **структуру** фиксированной длины (как запись «число, строка»), а для кортежа произвольной длины из однотипных элементов пишут многоточие: `tuple[float, ...]`.

Запись `list[int]` со встроенными типами работает с Python 3.9. В старом коде вы встретите `from typing import List, Dict` и `List[int]` — это то же самое в устаревшей форме.

## Псевдонимы типов

Сложные аннотации удобно назвать. Python 3.12 добавил для этого оператор `type`:

```python
type Vector = list[float]
type Embeddings = dict[str, Vector]


def dot(a: Vector, b: Vector) -> float:
    return sum(x * y for x, y in zip(a, b))


def most_similar(query: Vector, index: Embeddings) -> str:
    return max(index, key=lambda name: dot(query, index[name]))


index: Embeddings = {"кот": [0.9, 0.1], "машина": [0.1, 0.9]}
print(most_similar([0.8, 0.3], index))
```

```text
кот
```

Псевдонимы делают сигнатуры читаемыми: `most_similar(query: Vector, index: Embeddings)` говорит больше, чем `list[float]` и `dict[str, list[float]]`. В коде для более старых версий Python псевдоним записывают обычным присваиванием: `Vector = list[float]`.

## Аннотации в классах

В классах аннотируют атрибуты (в теле класса или в `__init__`) и методы. Параметр `self` не аннотируют — его тип очевиден:

```python
class Conversation:
    max_messages: int = 20

    def __init__(self, system_prompt: str) -> None:
        self.messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

    def add(self, role: str, content: str) -> int:
        self.messages.append({"role": role, "content": content})
        return len(self.messages)

    def last(self) -> dict[str, str]:
        return self.messages[-1]


chat = Conversation("Будь краток.")
print(chat.add("user", "Привет"), chat.last()["content"])
```

```text
2 Привет
```

`__init__` по соглашению аннотируют `-> None`. Именем своего класса тоже можно аннотировать: `def merge(self, other: Conversation) -> Conversation`.

## Чтение аннотаций во время выполнения

Аннотации хранятся в атрибуте `__annotations__` функции, класса или модуля. Надёжнее читать их функцией `typing.get_type_hints`:

```python
from typing import get_type_hints


def tokenize(text: str, lower: bool = True) -> list[str]:
    return (text.lower() if lower else text).split()


hints = get_type_hints(tokenize)
for name, hint in hints.items():
    print(name, "→", hint)
```

```text
text → <class 'str'>
lower → <class 'bool'>
return → list[str]
```

Именно так работают Pydantic, FastAPI и фреймворки для LLM-агентов: они читают аннотации и строят по ним проверку данных, документацию API или JSON-схему инструмента для модели.

## Разбор задачи: типизированный модуль метрик

Аннотируем небольшой модуль подсчёта метрик классификации. Типы помогают сразу понять, что функции принимают метки как списки целых чисел, а возвращают словарь «имя метрики → значение»:

```python
type Labels = list[int]


def confusion(y_true: Labels, y_pred: Labels, positive: int = 1) -> dict[str, int]:
    counts = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    for truth, pred in zip(y_true, y_pred):
        if pred == positive:
            counts["tp" if truth == positive else "fp"] += 1
        else:
            counts["fn" if truth == positive else "tn"] += 1
    return counts


def precision_recall(y_true: Labels, y_pred: Labels) -> dict[str, float]:
    c = confusion(y_true, y_pred)
    precision = c["tp"] / (c["tp"] + c["fp"]) if c["tp"] + c["fp"] else 0.0
    recall = c["tp"] / (c["tp"] + c["fn"]) if c["tp"] + c["fn"] else 0.0
    return {"precision": round(precision, 3), "recall": round(recall, 3)}


y_true = [1, 0, 1, 1, 0, 1]
y_pred = [1, 0, 0, 1, 1, 1]
print(confusion(y_true, y_pred))
print(precision_recall(y_true, y_pred))
```

```text
{'tp': 3, 'fp': 1, 'fn': 1, 'tn': 1}
{'precision': 0.75, 'recall': 0.75}
```

Сигнатуры читаются без тела функций: что передать, что получить. А если кто-то вызовет `precision_recall("101", "111")`, анализатор типов подсветит ошибку ещё в редакторе — хотя Python, как вы помните, честно попытается это выполнить.

## Попробуйте сами

- Аннотируйте функцию из части 1 (например, разбор конфигурации) и прочитайте аннотации через `get_type_hints`.
- Объявите псевдоним `type Batch = list[tuple[str, int]]` и функцию, принимающую `Batch`.
- Передайте в `average_score` строку и посмотрите, на какой строке и с какой ошибкой упадёт программа.

## Частые ошибки

**1. Ожидание проверки во время выполнения.** `def f(x: int)` не запрещает `f("текст")`. Для проверки данных нужна валидация (Pydantic) или явные `isinstance`.

**2. `list` вместо `list[int]`.** Голый `list` ничего не говорит о содержимом. Указывайте тип элементов.

**3. `tuple[int]` для кортежа произвольной длины.** Это кортеж ровно из одного элемента. Для любой длины — `tuple[int, ...]`.

**4. Забытый `-> None`.** Без аннотации возврата анализатор mypy по умолчанию вообще не проверяет тело функции (урок 4). Пишите `-> None` явно.

**5. Аннотация, противоречащая коду.** `def find(...) -> str`, а функция иногда возвращает `None`, — аннотация лжёт. Это решается `str | None` (следующий урок).

**6. Пробелы вокруг `=`.** `def f(x: int=5)` — по PEP 8 у аннотированного параметра пробелы ставятся: `x: int = 5`.

## Где это в AI-инженерии

- **FastAPI** (часть 8) строит проверку запросов и документацию API по аннотациям параметров обработчиков.
- **Pydantic** превращает аннотации полей в валидацию данных — конфигураций, ответов API, structured output LLM.
- **Инструменты агентов**: фреймворки читают аннотации и docstring функции, чтобы сгенерировать JSON-схему инструмента для модели — без аннотаций модель не узнает, какие аргументы передавать.
- **PyTorch, NumPy, Hugging Face** полностью аннотированы — редактор подсказывает формы и типы при работе с ними.
- **Командная разработка ML-сервисов**: аннотации плюс mypy в CI ловят ошибки интеграции модулей до деплоя.

## Итоги урока

- Аннотации: `def f(x: int, y: str = "a") -> float:` и `name: type = value`.
- Python их не проверяет — это контракт для людей, редакторов, mypy и библиотек вроде Pydantic.
- Коллекции: `list[int]`, `dict[str, float]`, `set[str]`, `tuple[int, str]`, `tuple[float, ...]`.
- `-> None` для функций без результата; `int` подходит туда, где ожидается `float`.
- Псевдонимы: `type Vector = list[float]` (Python 3.12) или `Vector = list[float]`.
- `typing.get_type_hints(obj)` читает аннотации во время выполнения.
