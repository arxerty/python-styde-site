# Optional, Union, Literal, Any, Callable

## Когда одного типа мало

В прошлом уроке каждая аннотация описывала ровно один тип. Но реальный код часто устроен сложнее:

- функция поиска возвращает найденный объект **или** `None`;
- параметр принимает число **или** строку;
- аргумент может быть только одним из нескольких конкретных значений: `"train"`, `"eval"`, `"test"`;
- параметр — это **функция** определённой сигнатуры.

Для таких случаев в Python есть объединения типов, литеральные типы, `Any` и `Callable`. Разберём их по очереди.

## X | None: значение или ничего

Самый частый случай — «значение или `None`». Записывается через вертикальную черту:

```python
def find_user(users: list[str], name: str) -> str | None:
    for user in users:
        if user.lower() == name.lower():
            return user
    return None


print(find_user(["Ада", "Алан"], "ада"))
print(find_user(["Ада", "Алан"], "грейс"))
```

```text
Ада
None
```

Аннотация `str | None` честно сообщает: результат может отсутствовать, и вызывающий код **обязан** это учесть. В старом коде вы встретите эквивалентную запись `Optional[str]` из модуля `typing` (с Python 3.10 предпочтительна запись через `|`).

Название `Optional` сбивает с толку: оно не значит «необязательный параметр». Параметр с аннотацией `str | None` без значения по умолчанию всё равно нужно передать. Необязательным его делает значение по умолчанию:

```python
def greet(name: str, title: str | None = None) -> str:
    if title is None:
        return f"Привет, {name}!"
    return f"Здравствуйте, {title} {name}!"


print(greet("Ада"))
print(greet("Лавлейс", title="леди"))
```

```text
Привет, Ада!
Здравствуйте, леди Лавлейс!
```

`title: str | None = None` — стандартный шаблон для необязательного параметра: «строка или ничего, по умолчанию ничего».

## Сужение типа

Значением типа `str | None` нельзя сразу пользоваться как строкой — вдруг там `None`. Анализатор типов (урок 4) потребует проверку, и после неё он **сужает** тип:

```python
def title_length(title: str | None) -> int:
    if title is None:
        return 0
    return len(title.strip())


print(title_length("  Отчёт  "), title_length(None))
```

```text
5 0
```

После `if title is None: return 0` анализатор знает: дальше `title` — точно `str`, и `title.strip()` безопасен. Сужение работает с `is None`, `isinstance`, `if not value` и ранними `return`. Это не только требование инструмента: проверка на `None` — главная защита от `AttributeError: 'NoneType' object has no attribute ...`, одной из самых частых ошибок в Python.

## Union: одно из нескольких

Вертикальная черта объединяет любые типы: `int | str`, `list[str] | str`, `float | None`. Такой тип называют **объединением** (union; в старом коде — `Union[int, str]`):

```python
def to_list(value: str | list[str]) -> list[str]:
    if isinstance(value, str):
        return [value]
    return value


def parse_size(value: int | str) -> int:
    if isinstance(value, int):
        return value
    units = {"k": 1_000, "m": 1_000_000}
    number, unit = value[:-1], value[-1].lower()
    return int(float(number) * units[unit])


print(to_list("один"), to_list(["а", "б"]))
print(parse_size(512), parse_size("8k"), parse_size("1.5M"))
```

```text
['один'] ['а', 'б']
512 8000 1500000
```

`isinstance` внутри функции сужает объединение до конкретного типа. Функции, которые принимают «одно значение или список», очень распространены в библиотеках: например, токенизаторы принимают и строку, и список строк.

Порядок типов в объединении значения не имеет: `int | str` и `str | int` — одно и то же. А вот порядок проверок внутри функции важен, если типы пересекаются: например, `bool` — подкласс `int`, поэтому проверку на `bool` ставят раньше проверки на `int`.

Не злоупотребляйте объединениями: функция, принимающая `int | str | list | dict | None`, скорее всего делает слишком много. Часто лучше нормализовать данные на входе и дальше работать с одним типом.

## Literal: конкретные значения

Иногда допустимы не любые строки, а лишь несколько конкретных. `Literal` из модуля `typing` перечисляет допустимые **значения**:

```python
from typing import Literal

type Split = Literal["train", "val", "test"]


def split_size(total: int, split: Split) -> int:
    ratios = {"train": 0.8, "val": 0.1, "test": 0.1}
    return int(total * ratios[split])


def log(message: str, level: Literal["info", "warning", "error"] = "info") -> str:
    return f"[{level.upper()}] {message}"


print(split_size(1000, "train"), split_size(1000, "val"))
print(log("загрузка данных"), log("мало памяти", level="warning"))
```

```text
800 100
[INFO] загрузка данных [WARNING] мало памяти
```

Если написать `split_size(1000, "tran")`, mypy сообщит об ошибке ещё до запуска, а редактор подскажет три допустимых варианта. Во время выполнения `Literal`, как и все аннотации, ничего не проверяет — но Pydantic (урок 5) проверит.

`Literal` — лёгкая альтернатива перечислениям `Enum` из блока 2.2: никакого класса, просто набор допустимых строк. Для простых параметров вроде режима или уровня логирования `Literal` удобнее; для значений с собственной логикой (методы, свойства) лучше `Enum`.

## Any и object

`Any` — «любой тип», при этом анализатор **отключает проверки** для такого значения: с `Any` можно делать что угодно, и ошибок не будет. `object` — тоже «любой тип», но проверки сохраняются: со значением типа `object` можно делать только то, что умеет любой объект (печатать, сравнивать, хешировать).

```python
from typing import Any


def describe(value: object) -> str:
    return f"{type(value).__name__}: {value!r}"


def get_path(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for key in path.split("."):
        current = current[key]
    return current


config = {"model": {"name": "bert", "layers": 12}, "lr": 0.001}
print(describe(42), describe([1, 2]))
print(get_path(config, "model.layers"))
```

```text
int: 42 list: [1, 2]
12
```

Правила использования:

- `Any` — для действительно произвольных данных, структура которых неизвестна: распарсенный JSON, ответ внешнего API, конфигурация произвольной вложенности;
- `object` — когда функция принимает что угодно, но не полагается на конкретные методы (как `describe`);
- каждое `Any` — «дыра» в проверке типов. Чем их меньше, тем больше ошибок поймает анализатор.

## Callable: функции как параметры

Функции — объекты (блок 2.4), поэтому их тоже нужно аннотировать. Для этого используют `Callable` из `collections.abc`: `Callable[[типы аргументов], тип результата]`:

```python
from collections.abc import Callable


def apply_to_all(values: list[float], func: Callable[[float], float]) -> list[float]:
    return [func(v) for v in values]


def make_scaler(factor: float) -> Callable[[float], float]:
    def scale(x: float) -> float:
        return x * factor
    return scale


Metric = Callable[[list[int], list[int]], float]


def accuracy(y_true: list[int], y_pred: list[int]) -> float:
    return sum(t == p for t, p in zip(y_true, y_pred)) / len(y_true)


def evaluate(metrics: dict[str, Metric], y_true: list[int], y_pred: list[int]) -> dict[str, float]:
    return {name: metric(y_true, y_pred) for name, metric in metrics.items()}


print(apply_to_all([1.0, 2.5], make_scaler(10)))
print(evaluate({"accuracy": accuracy}, [1, 0, 1, 1], [1, 1, 1, 0]))
```

```text
[10.0, 25.0]
{'accuracy': 0.5}
```

- `Callable[[float], float]` — функция одного аргумента `float`, возвращающая `float`;
- `make_scaler` возвращает функцию — это и отражено в аннотации результата;
- псевдоним `Metric` даёт имя сложной сигнатуре — так `evaluate` читается гораздо легче;
- `Callable[..., str]` (с многоточием) — функция с любыми аргументами, возвращающая строку; удобно для декораторов.

Импортировать `Callable` можно и из `typing`, но современный рекомендуемый источник — `collections.abc`.

## Аннотации *args и **kwargs

Для параметров `*args` и `**kwargs` аннотируют тип **одного элемента**:

```python
def total_tokens(*texts: str) -> int:
    return sum(len(t.split()) for t in texts)


def build_request(prompt: str, **options: float | int) -> dict[str, float | int | str]:
    return {"prompt": prompt, **options}


print(total_tokens("один два", "три"))
print(build_request("привет", temperature=0.2, max_tokens=100))
```

```text
3
{'prompt': 'привет', 'temperature': 0.2, 'max_tokens': 100}
```

`*texts: str` означает «каждый позиционный аргумент — строка» (внутри функции `texts` — `tuple[str, ...]`), а `**options: float | int` — «каждое именованное значение — число».

## Разбор задачи: настраиваемая предобработка

Напишем функцию предобработки текстов, которая принимает и одну строку, и список строк, режим регистра из фиксированного набора, необязательный лимит длины и произвольный дополнительный шаг-функцию:

```python
from collections.abc import Callable
from typing import Literal

type CaseMode = Literal["lower", "upper", "keep"]
type Step = Callable[[str], str]


def preprocess(
    texts: str | list[str],
    case: CaseMode = "lower",
    max_words: int | None = None,
    extra: Step | None = None,
) -> list[str]:
    items = [texts] if isinstance(texts, str) else texts
    result = []
    for text in items:
        text = " ".join(text.split())
        if case == "lower":
            text = text.lower()
        elif case == "upper":
            text = text.upper()
        if max_words is not None:
            text = " ".join(text.split()[:max_words])
        if extra is not None:
            text = extra(text)
        result.append(text)
    return result


print(preprocess("  Привет,   МИР  "))
print(preprocess(["Один два три", "Четыре"], case="keep", max_words=2))
print(preprocess("ok", case="upper", extra=lambda s: s + "!"))
```

```text
['привет, мир']
['Один два', 'Четыре']
['OK!']
```

По одной сигнатуре видно всё: что можно передать в `texts`, какие режимы регистра бывают, что `max_words` и `extra` необязательны. Обратите внимание на проверки `is not None` — именно они сужают `int | None` до `int` и `Step | None` до `Step`. Проверка `if max_words:` здесь была бы ошибкой: значение `0` тоже ложно, и ограничение «0 слов» молча не применилось бы.

## Попробуйте сами

- Напишите `first_or_default(items: list[str], default: str | None = None) -> str | None`.
- Добавьте в `preprocess` режим `"title"` и обновите `Literal`.
- Объявите псевдоним `Callback = Callable[[int, float], str | None]` для колбэков цикла обучения из блока 2.4.

## Частые ошибки

**1. `Optional[X]` как «необязательный параметр».** `Optional` значит «может быть None», а необязательным параметр делает значение по умолчанию.

**2. Использование значения без проверки на None.** `user.name` при `user: User | None` → `AttributeError` в рантайме и ошибка в mypy. Сначала `if user is None: ...`.

**3. `if value:` вместо `if value is not None:`.** Ноль, пустая строка и пустой список тоже ложны — «пустое» значение спутается с отсутствующим.

**4. `Any` везде, где лень думать.** Каждое `Any` отключает проверку. Используйте его точечно, для действительно неизвестных данных.

**5. `Callable` без сигнатуры.** Голый `Callable` ничего не сообщает о функции. Пишите `Callable[[int], str]`.

**6. Аннотация `**kwargs: dict[str, int]`.** Аннотируется тип одного значения: `**kwargs: int`.

## Где это в AI-инженерии

- **Параметры генерации** в SDK для LLM: `temperature: float | None = None`, `stop: str | list[str] | None = None` — типичные объединения.
- **Literal** описывает роли сообщений (`Literal["system", "user", "assistant"]`), режимы (`Literal["auto", "none", "required"]` для выбора инструментов) и форматы ответа.
- **Callable** — колбэки обучения, функции потерь, функции `collate_fn` и `transform` в датасетах PyTorch.
- **`Any`** — для сырых JSON-ответов API до их валидации через Pydantic.
- **Structured output**: Pydantic-модель с полем `Literal["positive", "negative"]` заставляет модель выбирать только из допустимых меток (урок 6).

## Итоги урока

- `X | None` — значение или `None`; необязательный параметр: `x: X | None = None`.
- Перед использованием сузьте тип проверкой `is None` или `isinstance`.
- `A | B` — объединение типов; не делайте функции, принимающие «всё подряд».
- `Literal["a", "b"]` — только перечисленные значения; лёгкая альтернатива `Enum`.
- `Any` отключает проверку, `object` — сохраняет; используйте `Any` точечно.
- `Callable[[аргументы], результат]` из `collections.abc` — тип функции; `*args: T`, `**kwargs: T` — тип одного элемента.
