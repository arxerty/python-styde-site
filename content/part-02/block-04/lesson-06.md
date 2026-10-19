# Контекстные менеджеры: with, __enter__/__exit__, contextlib

## Проблема: гарантированная уборка

Многие ресурсы нужно не только получить, но и обязательно освободить: открытый файл — закрыть, соединение с базой — вернуть в пул, блокировку — снять, временную настройку — восстановить. И сделать это нужно **даже если в середине работы произошла ошибка**.

Без специальных средств это выглядит так:

```python norun
file = open("data.txt", encoding="utf-8")
try:
    data = file.read()
    process(data)            # может бросить исключение
finally:
    file.close()             # выполнится в любом случае
```

Конструкция `try/finally` надёжна, но многословна, а забыть её очень легко. Оператор `with` (вы пользовались им для файлов в блоке 1.7) делает то же самое короче и надёжнее:

```python norun
with open("data.txt", encoding="utf-8") as file:
    data = file.read()
    process(data)
# здесь файл уже закрыт — даже если process упала
```

Объект, который можно использовать в `with`, называется **контекстным менеджером**. В этом уроке вы научитесь создавать свои.

## Протокол: __enter__ и __exit__

Контекстный менеджер — объект с двумя специальными методами:

- `__enter__(self)` — вызывается при входе в блок `with`; его результат присваивается переменной после `as`;
- `__exit__(self, exc_type, exc_value, traceback)` — вызывается при выходе из блока **в любом случае**: и при нормальном завершении, и при исключении.

```python
class Resource:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        print(f"открываю {self.name}")
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        print(f"закрываю {self.name}, исключение: {exc_type.__name__ if exc_type else None}")
        return False


with Resource("база данных") as db:
    print("работаю с", db.name)

try:
    with Resource("файл"):
        raise ValueError("что-то пошло не так")
except ValueError as error:
    print("поймано снаружи:", error)
```

```text
открываю база данных
работаю с база данных
закрываю база данных, исключение: None
открываю файл
закрываю файл, исключение: ValueError
поймано снаружи: что-то пошло не так
```

`with Resource(...) as db` работает так:

1. создаётся объект `Resource(...)`;
2. вызывается его `__enter__()`, результат связывается с `db`;
3. выполняется тело блока;
4. вызывается `__exit__(...)`: если исключения не было, все три аргумента — `None`; если было — тип, само исключение и трассировка.

## Подавление исключений

Значение, которое возвращает `__exit__`, имеет смысл. Если `__exit__` вернул **истинное** значение, исключение считается обработанным и **не распространяется** дальше. Если ложное (`False` или `None`) — исключение пролетает наружу после выполнения `__exit__`.

```python
class IgnoreErrors:
    def __init__(self, *types):
        self.types = types
        self.error = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type is not None and issubclass(exc_type, self.types):
            self.error = exc_value
            return True
        return False


with IgnoreErrors(KeyError, IndexError) as guard:
    config = {}
    value = config["missing"]
    print("эта строка не выполнится")
print("продолжаем, ошибка:", repr(guard.error))
```

```text
продолжаем, ошибка: KeyError('missing')
```

Исключение прервало блок `with` (последний `print` внутри не выполнился), но наружу не вышло. Подавлять исключения нужно осторожно и только конкретных типов: проглатывание всех ошибок скрывает баги.

## Таймер как контекстный менеджер

Контекстные менеджеры удобны для замера времени участка кода — не обязательно целой функции, как с декоратором:

```python
import time


class Timer:
    def __init__(self, label):
        self.label = label
        self.elapsed = None

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.elapsed = time.perf_counter() - self.start
        return False


with Timer("подготовка данных") as timer:
    squares = [i * i for i in range(100_000)]

print(timer.label, timer.elapsed > 0, len(squares))
```

```text
подготовка данных True 100000
```

Объект `timer` доступен и после выхода из блока — в нём сохранился результат замера. Конкретное время не печатаем: оно меняется от запуска к запуску.

## Временное изменение состояния

Частый сценарий — временно поменять настройку и гарантированно вернуть старое значение. Например, перевести модель в режим «без логирования» или подменить параметр на время теста:

```python
class Settings:
    def __init__(self):
        self.temperature = 0.7
        self.verbose = True


settings = Settings()


class override:
    def __init__(self, obj, **changes):
        self.obj = obj
        self.changes = changes
        self.saved = {}

    def __enter__(self):
        for name, value in self.changes.items():
            self.saved[name] = getattr(self.obj, name)
            setattr(self.obj, name, value)
        return self.obj

    def __exit__(self, exc_type, exc_value, traceback):
        for name, value in self.saved.items():
            setattr(self.obj, name, value)
        return False


with override(settings, temperature=0.0, verbose=False):
    print("внутри:", settings.temperature, settings.verbose)
print("снаружи:", settings.temperature, settings.verbose)
```

```text
внутри: 0.0 False
снаружи: 0.7 True
```

Даже если внутри блока произойдёт исключение, настройки будут восстановлены. Имя класса `override` написано строчными буквами намеренно: снаружи он используется как функция (`with override(...)`), и так принято для контекстных менеджеров в стандартной библиотеке (`open`, `suppress`).

## contextlib.contextmanager: менеджер из генератора

Писать класс с двумя методами для каждого контекстного менеджера утомительно. Модуль `contextlib` предлагает декоратор `@contextmanager`, который превращает **генераторную функцию** в контекстный менеджер:

- код до `yield` выполняется при входе (как `__enter__`);
- значение `yield` связывается с переменной после `as`;
- код после `yield` выполняется при выходе (как `__exit__`).

Чтобы код после `yield` выполнился и при исключении, его помещают в `finally`:

```python
from contextlib import contextmanager


@contextmanager
def temporary_value(obj, name, value):
    old = getattr(obj, name)
    setattr(obj, name, value)
    try:
        yield obj
    finally:
        setattr(obj, name, old)


class Model:
    training = True


model = Model()
try:
    with temporary_value(model, "training", False):
        print("в блоке training =", model.training)
        raise RuntimeError("ошибка инференса")
except RuntimeError:
    pass
print("после блока training =", model.training)
```

```text
в блоке training = False
после блока training = True
```

Это та же логика, что у класса `override`, но в шесть строк. Генератор приостанавливается на `yield`, пока выполняется тело блока `with`, а затем продолжает работу — вот где пригодились знания из блока 2.3.

Без `try/finally` код после `yield` при исключении **не выполнится** — это самая частая ошибка с `@contextmanager`.

## Готовые менеджеры из contextlib

```python
from contextlib import suppress, redirect_stdout
import io

with suppress(FileNotFoundError):
    open("несуществующий_файл.txt").read()
print("FileNotFoundError подавлен")

buffer = io.StringIO()
with redirect_stdout(buffer):
    print("этот текст попадёт в буфер")
print("в буфере:", buffer.getvalue().strip())
```

```text
FileNotFoundError подавлен
в буфере: этот текст попадёт в буфер
```

- `suppress(*exceptions)` — подавляет указанные исключения (готовая версия `IgnoreErrors`);
- `redirect_stdout(target)` — временно перенаправляет вывод `print` в другой объект (полезно в тестах);
- `nullcontext()` — «пустой» менеджер, когда менеджер нужен по синтаксису, но ничего делать не должен;
- `ExitStack` — для динамического числа менеджеров (например, открыть заранее неизвестное количество файлов).

## Несколько менеджеров в одном with

Менеджеры можно перечислить через запятую. Они входят слева направо, а выходят в обратном порядке — как вложенные блоки:

```python
from contextlib import contextmanager


@contextmanager
def tag(name):
    print(f"<{name}>")
    try:
        yield
    finally:
        print(f"</{name}>")


with tag("html"), tag("body"):
    print("содержимое")
```

```text
<html>
<body>
содержимое
</body>
</html>
```

## Декоратор или контекстный менеджер?

И декораторы, и контекстные менеджеры добавляют поведение «до» и «после» кода. Как выбрать?

**Декоратор** применяется к **целой функции** и действует при каждом её вызове. Он удобен, когда поведение — свойство функции: «эту функцию всегда кэшировать», «этот вызов API всегда повторять при сбоях».

**Контекстный менеджер** оборачивает **произвольный участок кода** — несколько строк внутри функции, а не всю функцию. Он удобен, когда поведение относится к ситуации, а не к функции: «эти три строки выполнить без градиентов», «на время этого теста подменить настройку», «замерить именно эту часть цикла».

Кроме того, контекстный менеджер может отдать в блок объект через `as` — файл, соединение, транзакцию, запись трассировки, — а декоратор так не умеет.

Часто один и тот же инструмент предоставляют в обоих видах. Например, `torch.no_grad()` в PyTorch работает и как `with torch.no_grad():`, и как декоратор `@torch.no_grad()` над функцией инференса. Класс с `__enter__`/`__exit__` легко превратить в декоратор, а `@contextmanager`-менеджеры поддерживают это автоматически.

## Разбор задачи: трассировка шагов LLM-пайплайна

В LLM-приложениях полезно видеть, сколько времени занял каждый шаг (поиск документов, генерация ответа) и какие шаги упали. Такая запись называется **трассировкой**, а отдельный шаг — **спаном** (span). Напишем контекстный менеджер `span`, который записывает шаги в журнал, поддерживает вложенность и фиксирует ошибки, не подавляя их:

```python
import time
from contextlib import contextmanager

TRACE = []
_depth = 0


@contextmanager
def span(name, clock=time.perf_counter):
    global _depth
    record = {"name": name, "depth": _depth, "status": "ok"}
    TRACE.append(record)
    start = clock()
    _depth += 1
    try:
        yield record
    except Exception as error:
        record["status"] = f"error: {type(error).__name__}"
        raise
    finally:
        _depth -= 1
        record["seconds"] = clock() - start


def answer(question):
    with span("pipeline"):
        with span("retrieve") as s:
            docs = ["док про with", "док про yield"]
            s["docs"] = len(docs)
        with span("generate"):
            if "ошибка" in question:
                raise TimeoutError("модель не ответила")
            return f"ответ на «{question}» по {len(docs)} документам"


print(answer("как работает with?"))
try:
    answer("вызови ошибка")
except TimeoutError:
    pass
for record in TRACE:
    print("  " * record["depth"] + f"{record['name']}: {record['status']}")
```

```text
ответ на «как работает with?» по 2 документам
pipeline: ok
  retrieve: ok
  generate: ok
pipeline: error: TimeoutError
  retrieve: ok
  generate: error: TimeoutError
```

Что здесь важно:

- `yield record` отдаёт запись в блок — шаг может добавить свои данные (`s["docs"] = 2`);
- `except ... raise` отмечает ошибку и **пробрасывает** её дальше: трассировка не должна менять поведение программы;
- `finally` уменьшает глубину и записывает длительность при любом исходе — иначе после первой ошибки вложенность «съехала» бы;
- `return` изнутри `with` тоже корректно закрывает все блоки — `__exit__` вызывается при любом выходе;
- параметр `clock` позволяет подставить фальшивые часы в тестах, как в уроке 4.

Так устроены спаны в OpenTelemetry, LangSmith и Langfuse — системах наблюдения за LLM-приложениями.

## Попробуйте сами

- Перепишите `Timer` с помощью `@contextmanager`.
- Напишите менеджер `temporary_item(d, key, value)`, временно подменяющий значение в словаре (и удаляющий ключ после выхода, если его не было).
- Уберите `try/finally` из `temporary_value` и проверьте, восстановится ли значение при исключении.

## Частые ошибки

**1. `__exit__`, случайно возвращающий `True`.** Все исключения внутри блока будут молча проглочены. Возвращайте `False` (или ничего), если не собираетесь подавлять ошибку осознанно.

**2. `@contextmanager` без `try/finally`.** При исключении код после `yield` не выполнится — ресурс не освободится.

**3. Два `yield` в генераторе-менеджере.** `RuntimeError: generator didn't stop`. В `@contextmanager` ровно один `yield`.

**4. Использование ресурса после блока.** `with open(...) as f:` → после блока `f.read()` даёт `ValueError: I/O operation on closed file`.

**5. Подавление слишком широких исключений.** `suppress(Exception)` скрывает настоящие ошибки. Перечисляйте конкретные типы.

**6. Забытый `return self` в `__enter__`.** Тогда `with Timer() as t:` присвоит `t = None`.

## Где это в AI-инженерии

- **PyTorch**: `with torch.no_grad():` отключает градиенты при инференсе (экономия памяти и времени); `with torch.autocast(...)` включает вычисления в пониженной точности.
- **Трассировка LLM-пайплайнов**: спаны в OpenTelemetry, LangSmith, Langfuse — контекстные менеджеры, измеряющие шаги RAG и вызовы инструментов.
- **Сессии и соединения**: `with httpx.Client() as client:` (блок 2.7), сессии баз данных (`with Session(engine) as session:` в SQLAlchemy, часть 8).
- **Временные файлы и папки** для промежуточных результатов: `tempfile.TemporaryDirectory()`.
- **Тесты**: `pytest.raises(ValueError)` и `unittest.mock.patch(...)` (блок 2.8) — контекстные менеджеры.

## Итоги урока

- `with` гарантирует освобождение ресурса при любом выходе из блока, включая исключения.
- Протокол: `__enter__` (результат → `as`) и `__exit__(exc_type, exc_value, traceback)`.
- Истинный результат `__exit__` подавляет исключение — используйте осознанно.
- `@contextmanager`: код до `yield` — вход, после — выход; оборачивайте `yield` в `try/finally`.
- `contextlib.suppress`, `redirect_stdout`, `nullcontext`, `ExitStack` — готовые менеджеры.
- Несколько менеджеров: `with a, b:` — вход слева направо, выход в обратном порядке.
