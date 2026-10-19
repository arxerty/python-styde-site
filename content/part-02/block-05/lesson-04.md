# mypy: проверка типов

## Статический анализ: ошибки без запуска

В прошлых уроках не раз звучало: «Python аннотации не проверяет — это сделает mypy». Пришло время познакомиться с ним.

**mypy** — **статический анализатор типов**. «Статический» значит, что он читает исходный код, **не запуская** его, и проверяет, согласуются ли типы: передаёте ли вы в функцию то, что она ожидает, возвращает ли функция то, что обещает, не обращаетесь ли к атрибуту у значения, которое может быть `None`.

Почему это важно, особенно в ML и LLM-проектах:

- ошибка «передал строку вместо списка» в коде, который запускается раз в сутки после многочасового обучения, обнаружится только через сутки — mypy найдёт её за секунду;
- редкие ветки кода (обработка ошибок API, пустые ответы модели) почти не покрываются ручными проверками, а mypy проверяет **все** ветки;
- при рефакторинге (переименовали поле, изменили формат ответа) mypy покажет все места, которые нужно поправить.

mypy не входит в стандартную библиотеку и работает **локально**, в терминале. Поэтому код этого урока — для чтения и запуска на вашем компьютере, а задания включают локальную проверку.

## Установка и запуск

```bash
pip install mypy
mypy app.py
mypy src/
```

mypy принимает файл, несколько файлов или папку. Если ошибок нет, он отвечает:

```text
Success: no issues found in 1 source file
```

## Чтение сообщений об ошибках

Возьмём файл `errors_demo.py`:

```python norun
def average(scores: list[float]) -> float:
    return sum(scores) / len(scores)


def find_user(users: list[str], name: str) -> str | None:
    for user in users:
        if user.lower() == name.lower():
            return user
    return None


result = average("0.9")
user = find_user(["Ada"], "ada")
print(user.upper())
count: int = "три"
```

Запуск `mypy errors_demo.py` выдаёт:

```text
errors_demo.py:12: error: Argument 1 to "average" has incompatible type "str"; expected "list[float]"  [arg-type]
errors_demo.py:14: error: Item "None" of "str | None" has no attribute "upper"  [union-attr]
errors_demo.py:15: error: Incompatible types in assignment (expression has type "str", variable has type "int")  [assignment]
Found 3 errors in 1 file (checked 1 source file)
```

Каждая строка устроена одинаково: **файл:строка: error: описание [код ошибки]**. Разберём:

- **строка 12, `arg-type`** — в `average` передана строка вместо списка. Python упал бы при выполнении (`sum` от строки) — но только если до этой строки дойдёт выполнение;
- **строка 14, `union-attr`** — `find_user` может вернуть `None`, а у `None` нет `.upper()`. Это та самая проверка, ради которой пишут `str | None`: при запуске с этим входом ошибки не было бы (пользователь нашёлся), но с другим входом программа упала бы;
- **строка 15, `assignment`** — переменной, объявленной как `int`, присвоена строка.

Код ошибки в квадратных скобках пригодится, чтобы точечно отключить проверку (об этом ниже) и чтобы найти описание ошибки в документации mypy.

## Самые частые ошибки

Ещё один файл `more_errors.py`:

```python norun
def find_user(users: list[str], name: str) -> str:
    for user in users:
        if user == name:
            return user
    return None


def add(a: int, b: int) -> int:
    return a + b


add(1)
add(1, b="2")
```

```text
more_errors.py:5: error: Incompatible return value type (got "None", expected "str")  [return-value]
more_errors.py:12: error: Missing positional argument "b" in call to "add"  [call-arg]
more_errors.py:13: error: Argument "b" to "add" has incompatible type "str"; expected "int"  [arg-type]
Found 3 errors in 1 file (checked 1 source file)
```

| Код | Что значит | Типичное исправление |
|---|---|---|
| `arg-type` | аргумент не того типа | передать правильный тип или расширить аннотацию |
| `return-value` | функция возвращает не то, что обещает | исправить аннотацию (`str \| None`) или код |
| `union-attr` | атрибут у значения, которое может быть `None` (или другим типом) | проверка `if x is None` перед использованием |
| `assignment` | присваивание несовместимого типа | не переиспользовать переменную под другой тип |
| `call-arg` | лишний или недостающий аргумент | исправить вызов |
| `attr-defined` | нет такого атрибута (часто опечатка) | исправить имя |
| `index` | неверный индекс или ключ (например, у TypedDict) | исправить ключ |

## Исправление через сужение типа

Как исправить ошибку `union-attr`? Не «заглушить», а обработать случай `None` — после проверки mypy сужает тип (урок 2):

```python
def find_user(users: list[str], name: str) -> str | None:
    for user in users:
        if user.lower() == name.lower():
            return user
    return None


user = find_user(["Ada"], "grace")
if user is None:
    print("пользователь не найден")
else:
    print(user.upper())
```

```text
пользователь не найден
```

Теперь mypy доволен, а программа корректно работает с обоими исходами. Это главный эффект проверки типов: она заставляет обрабатывать случаи, о которых легко забыть.

## Вывод типов и reveal_type

Аннотировать каждую переменную не нужно: mypy **выводит** тип из значения. Чтобы узнать, какой тип он вывел, используйте `reveal_type(...)` — специальную функцию, которую понимает mypy:

```python norun
from typing import Literal


def set_mode(mode: Literal["train", "eval"]) -> None:
    print(mode)


set_mode("tran")
values = [1, 2, 3]
reveal_type(values)
config = {"lr": 0.1, "epochs": 10}
reveal_type(config)
```

```text
literal_demo.py:6: error: Argument 1 to "set_mode" has incompatible type "Literal['tran']"; expected "Literal['train', 'eval']"  [arg-type]
literal_demo.py:8: note: Revealed type is "list[int]"
literal_demo.py:10: note: Revealed type is "dict[str, float]"
Found 1 error in 1 file (checked 1 source file)
```

Обратите внимание:

- опечатка `"tran"` в аргументе с типом `Literal` найдена;
- для `config` mypy вывел `dict[str, float]` — целое `10` подходит под `float`. Если бы в словаре были и числа, и строки, тип получился бы шире, и пришлось бы аннотировать явно (например, TypedDict).

`reveal_type` — инструмент отладки: уберите его после проверки. Без импорта (`from typing import reveal_type`) Python при обычном запуске не знает этого имени и упадёт с `NameError`.

## Неаннотированный код не проверяется

Важная особенность mypy по умолчанию: функции **без аннотаций** он не проверяет и считает их результат типом `Any`. Это сделано для **постепенной типизации** (gradual typing): можно добавлять аннотации в большой проект по кусочкам, не получая тысячи ошибок сразу.

```python norun
def tokenize(text):
    return text.split()


def count(text: str) -> int:
    words = tokenize(text)
    reveal_type(words)
    return len(words)


def untyped(x):
    return x + "a" + 1
```

```text
untyped_demo.py:7: note: Revealed type is "Any"
Success: no issues found in 1 source file
```

Функция `untyped` содержит явную ошибку (`"a" + 1`), но mypy молчит — функция не аннотирована. А результат `tokenize` — `Any`, и все проверки для `words` отключены. С флагом `--strict` mypy требует аннотаций везде:

```bash
mypy --strict untyped_demo.py
```

```text
untyped_demo.py:1: error: Function is missing a type annotation  [no-untyped-def]
untyped_demo.py:6: error: Call to untyped function "tokenize" in typed context  [no-untyped-call]
untyped_demo.py:7: note: Revealed type is "Any"
untyped_demo.py:11: error: Function is missing a type annotation  [no-untyped-def]
Found 3 errors in 1 file (checked 1 source file)
```

Именно поэтому в уроке 1 советовалось писать `-> None` даже у функций без результата: функция без единой аннотации выпадает из проверки.

## Настройка в pyproject.toml

Флаги командной строки удобно сохранить в конфигурации проекта. Обычно это файл `pyproject.toml` в корне (подробно о нём — в блоке 2.8):

```toml
[tool.mypy]
python_version = "3.12"
strict = true
warn_unused_ignores = true

[[tool.mypy.overrides]]
module = ["some_untyped_library.*"]
ignore_missing_imports = true
```

- `strict = true` включает набор строгих проверок (включая требование аннотаций) — разумный выбор для нового проекта;
- для старого проекта начинают с настроек по умолчанию и постепенно ужесточают: например, `disallow_untyped_defs = true` только для новых модулей;
- `ignore_missing_imports` — для сторонних библиотек без аннотаций. Для многих популярных библиотек есть отдельные пакеты с аннотациями — «стабы» (`pip install types-requests`, `types-PyYAML`).

После этого достаточно запускать просто `mypy .` или `mypy src`.

## Когда mypy не прав: type: ignore и cast

Иногда анализатор не может понять корректный код — например, при работе с библиотекой без аннотаций или с динамическими конструкциями. Есть два инструмента:

```python norun
from typing import cast

import some_untyped_library  # type: ignore[import-untyped]

raw = load_json("config.json")
config = cast(dict[str, float], raw)

value = legacy_function()  # type: ignore[no-untyped-call]
```

- `# type: ignore[код]` в конце строки отключает **конкретную** ошибку на **этой** строке. Всегда указывайте код — голый `# type: ignore` скрывает любые ошибки, включая будущие;
- `cast(тип, значение)` говорит анализатору «поверь, здесь этот тип». Во время выполнения `cast` ничего не проверяет и не преобразует — если вы ошиблись, ошибка просто проявится позже. Для реальной проверки данных используйте `isinstance` или Pydantic.

Оба инструмента — исключение, а не правило. Каждый `type: ignore` — место, где проверка выключена; флаг `warn_unused_ignores` напомнит удалить те, что стали не нужны.

## mypy в рабочем процессе

Проверка типов полезна, только если запускается регулярно:

- **в редакторе**: расширения для VS Code и PyCharm показывают ошибки прямо при наборе (VS Code использует Pyright/Pylance — другой анализатор с той же системой аннотаций);
- **перед коммитом**: через pre-commit (блок 2.8);
- **в CI**: каждый pull request проверяется командой `mypy src`, и код с ошибками типов не попадает в основную ветку.

Помимо mypy существуют Pyright (от Microsoft, быстрый, используется в VS Code) и более новые анализаторы. Аннотации у всех общие — меняется только инструмент.

## Разбор задачи: типизация модуля перед рефакторингом

Представьте модуль обработки ответов модели, написанный без аннотаций:

```python norun
def parse_score(text):
    try:
        return float(text.strip().rstrip("%")) / 100
    except ValueError:
        return None


def average_score(texts):
    scores = [parse_score(t) for t in texts]
    return sum(scores) / len(scores)
```

Добавим аннотации — и mypy сразу найдёт баг, который тесты на «хороших» данных не ловили:

```python norun
def parse_score(text: str) -> float | None:
    try:
        return float(text.strip().rstrip("%")) / 100
    except ValueError:
        return None


def average_score(texts: list[str]) -> float:
    scores = [parse_score(t) for t in texts]
    return sum(scores) / len(scores)
```

```text
scores.py:10: error: Argument 1 to "sum" has incompatible type "list[float | None]"; expected "Iterable[bool]"  [arg-type]
Found 1 error in 1 file (checked 1 source file)
```

Часть «expected» выглядит странно: у `sum` несколько вариантов сигнатуры (перегрузок), и mypy показал один из них. Главное в сообщении — `list[float | None]`: в списке могут оказаться `None`. При первом же ответе модели вида «не знаю» программа упала бы с `TypeError`. Исправление — явно решить, что делать с непонятыми ответами:

```python
def parse_score(text: str) -> float | None:
    try:
        return float(text.strip().rstrip("%")) / 100
    except ValueError:
        return None


def average_score(texts: list[str]) -> float | None:
    scores = [s for s in (parse_score(t) for t in texts) if s is not None]
    if not scores:
        return None
    return round(sum(scores) / len(scores), 3)


print(average_score(["90%", " 80% ", "не знаю"]))
print(average_score(["???"]))
```

```text
0.85
None
```

Фильтр `if s is not None` сужает тип элементов до `float`, а результат функции честно стал `float | None` — случай «ни одного числа» тоже обработан. Аннотации превратили скрытый баг в явное решение.

## Попробуйте сами

- Установите mypy (`pip install mypy`) и запустите его на любом своём файле из части 1. Сколько ошибок нашлось с `--strict`?
- Напишите функцию с аннотацией `-> int`, которая в одной из веток забывает `return`. Что скажет mypy?
- Вставьте `reveal_type` для результата `sorted(dict.items())` и посмотрите на выведенный тип.

## Частые ошибки

**1. Неаннотированные функции «проходят проверку».** По умолчанию mypy их не проверяет. Используйте `--strict` или хотя бы `disallow_untyped_defs`.

**2. Голый `# type: ignore`.** Скрывает все ошибки строки, включая будущие. Указывайте код: `# type: ignore[arg-type]`.

**3. `cast` как проверка.** `cast` ничего не проверяет во время выполнения — это обещание анализатору. Для данных из внешнего мира нужна валидация.

**4. «Заглушить» вместо исправить.** Ошибка `union-attr` почти всегда означает необработанный `None`. Добавьте проверку, а не `ignore`.

**5. Переиспользование переменной под другой тип.** `data = load(); data = len(data)` — ошибка `assignment`. Дайте результату новое имя.

**6. Запуск mypy раз в полгода.** Ошибки копятся тысячами, и их никто не исправит. Запускайте в CI на каждом изменении.

## Где это в AI-инженерии

- **ML-сервисы в продакшене**: mypy в CI ловит несогласованность форматов между модулями — препроцессингом, моделью, API.
- **Библиотеки** PyTorch, transformers, FastAPI, Pydantic, SDK для LLM распространяются с аннотациями — mypy проверяет и ваши вызовы их функций.
- **Работа с ответами LLM**: модель может вернуть что угодно, и `str | None`, `Literal` и mypy заставляют обработать все варианты.
- **Рефакторинг** больших кодовых баз ML-платформ: изменили формат конфигурации — mypy показывает все места, которые нужно поправить.
- **Агентные фреймворки** генерируют схемы инструментов по аннотациям — mypy гарантирует, что эти аннотации согласованы с кодом.

## Итоги урока

- mypy проверяет согласованность типов без запуска программы: `pip install mypy`, затем `mypy файл.py` или `mypy папка/`.
- Формат сообщения: `файл:строка: error: описание [код]`; частые коды — `arg-type`, `return-value`, `union-attr`, `assignment`, `call-arg`.
- Исправляйте причину (например, проверку на `None`), а не прячьте ошибку.
- Неаннотированные функции по умолчанию не проверяются; `--strict` требует аннотаций везде.
- Настройки — в `[tool.mypy]` файла `pyproject.toml`; `reveal_type` показывает выведенный тип.
- `# type: ignore[код]` и `cast` — точечные исключения, а не способ работы.
