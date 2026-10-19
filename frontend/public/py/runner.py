"""Движок выполнения и проверки кода учеников.

Один и тот же файл работает:
  * в браузере — внутри Pyodide (web worker вызывает handle());
  * локально — в tools/verify_content.py для проверки эталонных решений.

Протокол: handle(kind, payload_json) -> result_json
  kind = "run":  {"code", "stdin"?, "files"?}               -> {"stdout", "error", "images"}
  kind = "test": {"code", "tests", "setup"?, "files"?, "constraints"?}
                 -> {"passed", "results": [{"name","passed","message"}], "error"}
"""
import base64
import builtins
import io
import json
import math
import numbers
import os
import re
import sys
import tokenize
import traceback
import warnings

MAX_OUTPUT = 50_000
USER_FILE = "<main.py>"


def _install_sync_asyncio():
    """В Pyodide asyncio.run() недоступен (уже работает браузерный цикл событий).

    Подменяем его на свой синхронный цикл без сетевого ввода-вывода: корутины, sleep,
    gather, create_task, таймауты и семафоры работают как в обычном Python.
    """
    import asyncio
    import time as _time
    from asyncio import base_events, events, runners

    class _NoIOSelector:
        def select(self, timeout=None):
            if timeout:
                _time.sleep(timeout)
            return []

        def close(self):
            pass

    class _SyncLoop(base_events.BaseEventLoop):
        def __init__(self):
            super().__init__()
            self._selector = _NoIOSelector()

        def _process_events(self, event_list):
            pass

        def _write_to_self(self):
            pass

    def run(main, *, debug=None):
        previous = events._get_running_loop()
        events._set_running_loop(None)
        loop = _SyncLoop()
        try:
            if debug is not None:
                loop.set_debug(debug)
            return loop.run_until_complete(main)
        finally:
            try:
                runners._cancel_all_tasks(loop)
                loop.run_until_complete(loop.shutdown_asyncgens())
            finally:
                loop.close()
                events._set_running_loop(previous)

    asyncio.run = run


if sys.platform == "emscripten":
    _install_sync_asyncio()

ERROR_HINTS = {
    "SyntaxError": "Синтаксическая ошибка: Python не может разобрать код. Проверьте скобки, кавычки и двоеточия после if/for/while/def.",
    "IndentationError": "Ошибка отступов: тело if/for/def должно быть сдвинуто одинаково (обычно на 4 пробела).",
    "TabError": "Смешаны табы и пробелы в отступах — используйте только пробелы.",
    "NameError": "Имя не найдено: переменная или функция не определена. Проверьте опечатки и то, что переменная создана до использования.",
    "UnboundLocalError": "Локальная переменная используется до присваивания. Возможно, нужен global/nonlocal или начальное значение.",
    "TypeError": "Ошибка типа: операция применена к неподходящему типу (например, строка + число) или функция вызвана с неверными аргументами.",
    "ValueError": "Неверное значение: тип подходит, но само значение нет (например, int('abc')).",
    "ZeroDivisionError": "Деление на ноль. Проверьте делитель перед делением.",
    "IndexError": "Индекс за пределами последовательности. Помните: индексы начинаются с 0, последний — len(x) - 1.",
    "KeyError": "Такого ключа нет в словаре. Используйте dict.get() или проверку `key in d`.",
    "AttributeError": "У объекта нет такого атрибута или метода. Проверьте тип объекта и написание имени.",
    "ModuleNotFoundError": "Модуль не найден. Проверьте имя модуля; в браузере доступны стандартная библиотека и numpy/pandas/scikit-learn/matplotlib.",
    "ImportError": "Не удалось импортировать имя из модуля.",
    "RecursionError": "Превышена глубина рекурсии — вероятно, у рекурсивной функции нет базового случая.",
    "EOFError": "Программа вызвала input(), но вводимые данные закончились.",
    "FileNotFoundError": "Файл не найден. Проверьте имя и путь к файлу.",
    "AssertionError": "Проверка assert не прошла.",
    "StopIteration": "Итератор исчерпан: next() вызван, когда элементов больше нет.",
    "OverflowError": "Число слишком большое для этой операции.",
    "MemoryError": "Не хватает памяти — возможно, создаётся слишком большая структура данных.",
    "KeyboardInterrupt": "Выполнение прервано.",
    "TimeoutError": "Превышено время ожидания.",
    "NotImplementedError": "Метод не реализован — допишите его.",
    "ValidationError": "Данные не прошли валидацию.",
}

MESSAGE_TRANSLATIONS = [
    (r"name '(.+?)' is not defined", "имя '{0}' не определено"),
    (r"cannot access local variable '(.+?)' where it is not associated with a value", "локальная переменная '{0}' используется до присваивания"),
    (r"unsupported operand type\(s\) for (.+?): '(.+?)' and '(.+?)'", "нельзя применить операцию {0} к типам '{1}' и '{2}'"),
    (r'can only concatenate str \(not "(.+?)"\) to str', "к строке можно прибавить только строку (а не {0})"),
    (r"(?:integer |float )?division(?: or modulo)? by zero", "деление на ноль"),
    (r"(list|string|tuple|range object) index out of range", "индекс вне диапазона ({0})"),
    (r"invalid literal for int\(\) with base 10: (.+)", "невозможно преобразовать {0} в целое число"),
    (r"could not convert string to float: (.+)", "невозможно преобразовать {0} в дробное число"),
    (r"'(.+?)' object has no attribute '(.+?)'", "у объекта типа '{0}' нет атрибута '{1}'"),
    (r"(.+?)\(\) missing (\d+) required positional arguments?", "функции {0}() не хватает обязательных аргументов: {1}"),
    (r"(.+?)\(\) takes (\d+) positional arguments? but (\d+) (?:was|were) given", "функция {0}() принимает {1} позиц. аргумент(ов), а передано {2}"),
    (r"'(.+?)' object is not subscriptable", "объект типа '{0}' не поддерживает обращение по индексу []"),
    (r"'(.+?)' object is not callable", "объект типа '{0}' нельзя вызвать как функцию"),
    (r"'(.+?)' object is not iterable", "объект типа '{0}' нельзя перебирать"),
    (r"'(.+?)' object does not support item assignment", "объект типа '{0}' нельзя изменять по индексу (он неизменяемый)"),
    (r"maximum recursion depth exceeded", "превышена максимальная глубина рекурсии"),
    (r"expected ':'", "ожидается двоеточие ':'"),
    (r"invalid decimal literal", "неверная запись числа (буква внутри числа?)"),
    (r"invalid syntax", "неверный синтаксис"),
    (r"unexpected indent", "неожиданный отступ"),
    (r"expected an indented block", "ожидается блок с отступом"),
    (r"unindent does not match any outer indentation level", "отступ не совпадает ни с одним внешним уровнем"),
    (r"unterminated string literal", "незакрытая строка — не хватает кавычки"),
    (r"'(.)' was never closed", "скобка '{0}' не закрыта"),
    (r"unmatched '(.)'", "лишняя закрывающая скобка '{0}'"),
    (r"No module named '(.+?)'", "модуль '{0}' не найден"),
    (r"\[Errno 2\] No such file or directory: (.+)", "файл не найден: {0}"),
    (r"EOF when reading a line", "ввод закончился"),
]


def translate_message(message: str) -> str:
    for pattern, template in MESSAGE_TRANSLATIONS:
        match = re.search(pattern, message)
        if match:
            return template.format(*match.groups())
    return message


class InputFeeder:
    """Подменяет input(): отдаёт строки из stdin по одной."""

    def __init__(self, text, echo):
        self.lines = text.split("\n") if text else []
        if self.lines and self.lines[-1] == "" and text.endswith("\n"):
            self.lines.pop()
        self.index = 0
        self.echo = echo

    def __call__(self, prompt=""):
        if self.echo and prompt:
            sys.stdout.write(str(prompt))
        if self.index >= len(self.lines):
            raise EOFError("Программа запросила ввод (input()), но данных больше нет")
        line = self.lines[self.index]
        self.index += 1
        if self.echo:
            sys.stdout.write(line + "\n")
        return line


class LimitedOutput(io.StringIO):
    def write(self, text):
        if self.tell() > MAX_OUTPUT:
            return len(text)
        return super().write(text)


def format_error(error, source=None, filename=USER_FILE):
    name = type(error).__name__
    message = str(error)
    line = None
    if isinstance(error, SyntaxError):
        if error.filename == filename:
            line = error.lineno
        message = error.msg
    else:
        for frame in traceback.extract_tb(error.__traceback__):
            if frame.filename == filename:
                line = frame.lineno
    translated = translate_message(message)
    parts = []
    where = f" (строка {line})" if line else ""
    parts.append(f"{name}{where}: {translated}")
    if translated != message:
        parts.append(f"Оригинал: {message}")
    if source and line:
        source_lines = source.splitlines()
        if 0 < line <= len(source_lines):
            parts.append(f"    {line} | {source_lines[line - 1].strip()}")
    hint = ERROR_HINTS.get(name)
    if hint:
        parts.append(f"Подсказка: {hint}")
    return {"type": name, "line": line, "message": translated, "text": "\n".join(parts)}


class Capture:
    """Перехватывает stdout/stderr/input на время выполнения."""

    def __init__(self, stdin, echo):
        self.buffer = LimitedOutput()
        self.feeder = InputFeeder(stdin or "", echo)

    def __enter__(self):
        self.saved = (sys.stdout, sys.stderr, builtins.input)
        sys.stdout = self.buffer
        sys.stderr = self.buffer
        builtins.input = self.feeder
        return self

    def __exit__(self, *exc):
        sys.stdout, sys.stderr, builtins.input = self.saved
        return False

    @property
    def text(self):
        value = self.buffer.getvalue()
        if len(value) > MAX_OUTPUT:
            value = value[:MAX_OUTPUT] + "\n… (вывод обрезан)"
        return value


def write_files(files):
    for name, text in (files or {}).items():
        directory = os.path.dirname(name)
        if directory:
            os.makedirs(directory, exist_ok=True)
        with open(name, "w", encoding="utf-8") as file:
            file.write(text)


def prepare_matplotlib():
    os.environ.setdefault("MPLBACKEND", "agg")
    if "matplotlib.pyplot" in sys.modules:
        sys.modules["matplotlib.pyplot"].close("all")


def collect_figures():
    if "matplotlib.pyplot" not in sys.modules:
        return []
    plt = sys.modules["matplotlib.pyplot"]
    images = []
    for number in plt.get_fignums():
        figure = plt.figure(number)
        buffer = io.BytesIO()
        figure.savefig(buffer, format="png", dpi=90, bbox_inches="tight")
        images.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
    plt.close("all")
    return images


def execute(code, namespace, stdin="", echo=False):
    """Выполняет код ученика. Возвращает (stdout, error|None)."""
    with Capture(stdin, echo) as capture:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                exec(compile(code, USER_FILE, "exec"), namespace)
            error = None
        except SystemExit:
            error = None
        except BaseException as exc:  # noqa: BLE001 — ученический код может бросить что угодно
            error = format_error(exc, code)
    return capture.text, error


# ---------- сравнение результатов ----------

def short_repr(value, limit=300):
    try:
        text = repr(value)
    except Exception:  # noqa: BLE001
        text = f"<{type(value).__name__}>"
    return text if len(text) <= limit else text[:limit] + "…"


def values_equal(actual, expected):
    if expected is None or actual is None:
        return actual is expected
    if isinstance(expected, bool) or isinstance(actual, bool):
        both_bool = all(isinstance(v, bool) or type(v).__name__ == "bool_" for v in (actual, expected))
        return both_bool and bool(actual) == bool(expected)
    module = type(expected).__module__.split(".")[0]
    actual_module = type(actual).__module__.split(".")[0]
    if module == "pandas" or actual_module == "pandas":
        return _pandas_equal(actual, expected)
    if module == "numpy" and hasattr(expected, "shape") or actual_module == "numpy" and hasattr(actual, "shape"):
        return _numpy_equal(actual, expected)
    if isinstance(expected, numbers.Number) and isinstance(actual, numbers.Number):
        if isinstance(expected, numbers.Complex) and not isinstance(expected, numbers.Real):
            return abs(complex(actual) - complex(expected)) < 1e-9
        a, e = float(actual), float(expected)
        if math.isnan(a) and math.isnan(e):
            return True
        return math.isclose(a, e, rel_tol=1e-6, abs_tol=1e-9)
    if isinstance(expected, (list, tuple)):
        if type(actual) is not type(expected) or len(actual) != len(expected):
            return False
        return all(values_equal(a, e) for a, e in zip(actual, expected))
    if isinstance(expected, dict):
        if not isinstance(actual, dict) or set(actual) != set(expected):
            return False
        return all(values_equal(actual[key], expected[key]) for key in expected)
    try:
        return bool(actual == expected)
    except Exception:  # noqa: BLE001
        return False


def _numpy_equal(actual, expected):
    import numpy as np

    a, e = np.asarray(actual), np.asarray(expected)
    if a.shape != e.shape:
        return False
    if a.dtype.kind in "fc" or e.dtype.kind in "fc":
        try:
            return bool(np.allclose(a, e, rtol=1e-6, atol=1e-9, equal_nan=True))
        except TypeError:
            return False
    return bool(np.array_equal(a, e))


def _pandas_equal(actual, expected):
    import pandas as pd

    try:
        if isinstance(expected, pd.DataFrame):
            pd.testing.assert_frame_equal(actual, expected, check_dtype=False, check_exact=False)
        elif isinstance(expected, pd.Series):
            pd.testing.assert_series_equal(actual, expected, check_dtype=False, check_exact=False, check_names=False)
        elif isinstance(expected, pd.Index):
            pd.testing.assert_index_equal(actual, expected, exact=False)
        else:
            return bool(actual == expected)
        return True
    except (AssertionError, TypeError):
        return False


def normalize_output(text):
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    while lines and not lines[0]:
        lines.pop(0)
    return "\n".join(lines)


def strip_comments(code):
    try:
        tokens = tokenize.generate_tokens(io.StringIO(code).readline)
        kept = [tok for tok in tokens if tok.type != tokenize.COMMENT]
        return tokenize.untokenize(kept)
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return code


def check_constraints(code, constraints):
    if not constraints:
        return None
    clean = strip_comments(code)
    problems = []
    for needle in constraints.get("require") or []:
        if needle not in clean:
            problems.append(f"в решении должно использоваться: {needle}")
    for needle in constraints.get("forbid") or []:
        if needle in clean:
            problems.append(f"в решении нельзя использовать: {needle}")
    if not problems:
        return None
    message = "Решение не соответствует ограничениям задачи: " + "; ".join(problems)
    if constraints.get("message"):
        message += f". {constraints['message']}"
    return message


# ---------- запуск тестов ----------

def run_single_test(code, test, setup, files):
    name = test.get("name", "тест")
    write_files(files)
    prepare_matplotlib()
    is_program = test.get("stdout") is not None or test.get("stdout_contains") is not None
    # Для тестов функций код ученика импортируется как модуль: блок
    # `if __name__ == "__main__":` не выполняется (как при import solution).
    namespace = {"__name__": "__main__" if is_program else "solution", "__builtins__": builtins}
    full_setup = "\n".join(part for part in (setup, test.get("setup") or "") if part)
    if full_setup:
        try:
            exec(compile(full_setup, "<setup>", "exec"), namespace)
        except BaseException as exc:  # noqa: BLE001
            return {"name": name, "passed": False, "message": "Ошибка в подготовке теста: " + format_error(exc, full_setup, "<setup>")["text"]}

    stdin = test.get("stdin") or ""
    output, error = execute(code, namespace, stdin=stdin)
    if error:
        return {"name": name, "passed": False, "message": error["text"], "stdout": output[-2000:]}

    if test.get("call") is not None:
        with Capture(stdin, False) as capture:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    actual = eval(compile(test["call"], "<test>", "eval"), namespace)
            except BaseException as exc:  # noqa: BLE001
                return {
                    "name": name,
                    "passed": False,
                    "message": f"Вызов {test['call']} завершился ошибкой:\n" + format_error(exc, code)["text"],
                    "stdout": capture.text[-2000:],
                }
        expected_namespace = {"__builtins__": builtins}
        if full_setup:
            exec(compile(full_setup, "<setup>", "exec"), expected_namespace)
        expected = eval(compile(test["expected"], "<expected>", "eval"), expected_namespace)
        if values_equal(actual, expected):
            return {"name": name, "passed": True, "message": ""}
        return {
            "name": name,
            "passed": False,
            "message": f"Вызов: {test['call']}\nОжидалось: {short_repr(expected)}\nПолучено:  {short_repr(actual)}",
        }

    if test.get("stdout") is not None:
        actual = normalize_output(output)
        expected = normalize_output(test["stdout"])
        if actual == expected:
            return {"name": name, "passed": True, "message": ""}
        input_note = f"Ввод:\n{stdin}\n" if stdin else ""
        return {
            "name": name,
            "passed": False,
            "message": f"{input_note}Ожидаемый вывод:\n{expected}\n\nВаш вывод:\n{actual or '(пусто)'}",
        }

    if test.get("stdout_contains") is not None:
        missing = [part for part in test["stdout_contains"] if part not in output]
        if not missing:
            return {"name": name, "passed": True, "message": ""}
        return {
            "name": name,
            "passed": False,
            "message": "В выводе не найдено: " + ", ".join(repr(part) for part in missing) + f"\n\nВаш вывод:\n{normalize_output(output) or '(пусто)'}",
        }

    test_code = test.get("code") or ""
    # Тесты могут проверять вывод программы и текст решения
    namespace["__stdout__"] = output
    namespace["__source__"] = code
    with Capture(stdin, False) as capture:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                exec(compile(test_code, "<test>", "exec"), namespace)
        except AssertionError as exc:
            message = str(exc) or "Проверка не прошла"
            return {"name": name, "passed": False, "message": message}
        except BaseException as exc:  # noqa: BLE001
            return {"name": name, "passed": False, "message": "Ошибка при проверке:\n" + format_error(exc, code)["text"]}
    return {"name": name, "passed": True, "message": ""}


def run_tests(payload):
    code = payload.get("code", "")
    try:
        compile(code, USER_FILE, "exec")
    except SyntaxError as exc:
        return {"passed": False, "results": [], "error": format_error(exc, code)["text"]}
    violation = check_constraints(code, payload.get("constraints"))
    if violation:
        return {"passed": False, "results": [], "error": violation}
    results = [
        run_single_test(code, test, payload.get("setup") or "", payload.get("files") or {})
        for test in payload.get("tests", [])
    ]
    if "matplotlib.pyplot" in sys.modules:
        sys.modules["matplotlib.pyplot"].close("all")
    return {"passed": bool(results) and all(r["passed"] for r in results), "results": results, "error": None}


def run_code(payload):
    write_files(payload.get("files"))
    prepare_matplotlib()
    namespace = {"__name__": "__main__", "__builtins__": builtins}
    if payload.get("setup"):
        execute(payload["setup"], namespace)
    output, error = execute(payload.get("code", ""), namespace, stdin=payload.get("stdin") or "", echo=True)
    images = []
    try:
        images = collect_figures()
    except Exception:  # noqa: BLE001
        pass
    return {"stdout": output, "error": error["text"] if error else None, "images": images}


def handle(kind, payload_json):
    payload = json.loads(payload_json)
    if kind == "run":
        result = run_code(payload)
    elif kind == "test":
        result = run_tests(payload)
    else:
        result = {"error": f"неизвестная команда {kind}"}
    return json.dumps(result, ensure_ascii=False, default=str)
