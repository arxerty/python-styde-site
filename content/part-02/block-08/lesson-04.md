# Структура проекта, пакеты, pyproject.toml, uv и poetry

## От скрипта к проекту

Большинство AI-проектов начинается с одного файла: `bot.py` на 50 строк, который вызывает модель. Через месяц в нём 1500 строк: клиент API, промпты, разбор ответов, кэш, команды командной строки, настройки. Найти что-либо трудно, протестировать отдельную часть невозможно, а коллега, скачавший код, не знает, какие библиотеки и каких версий нужно установить.

Профессиональный Python-проект решает три задачи:

1. **Код разбит на модули и пакеты** по ответственности: клиент отдельно, модели данных отдельно, CLI отдельно.
2. **Зависимости описаны** в одном стандартном файле с версиями — проект можно воспроизвести на другом компьютере.
3. **Проект устанавливается** как обычная библиотека: `pip install -e .`, после чего `import mypackage` работает из любого места, а команда `mytool` доступна в терминале.

## Модули и пакеты

**Модуль** — любой файл `.py`. Команда `import tokens` находит файл `tokens.py`, выполняет его один раз и даёт доступ к его именам: `tokens.count_tokens(...)`. Повторный `import` уже не выполняет файл — модуль берётся из кэша `sys.modules`.

**Пакет** — папка с модулями, обычно с файлом `__init__.py`. Пакеты могут быть вложенными:

```text
fxcli/
├── __init__.py
├── client.py
├── models.py
└── cli/
    ├── __init__.py
    └── commands.py
```

```python norun
import fxcli.client                     # модуль внутри пакета
from fxcli.models import Rates          # имя из модуля пакета
from fxcli.cli.commands import convert  # вложенный пакет
```

Файл `__init__.py` выполняется при первом импорте пакета. Его используют, чтобы:

- задать **публичный интерфейс** — поднять важные имена на верхний уровень: `from .client import FxClient` позволяет писать `from fxcli import FxClient`;
- хранить **версию**: `__version__ = "0.3.0"`;
- (реже) выполнить инициализацию пакета.

Держите `__init__.py` коротким: тяжёлые импорты в нём замедляют любой `import fxcli`.

## Абсолютные и относительные импорты

Внутри пакета модули импортируют друг друга двумя способами:

```python norun
# fxcli/cli/commands.py
from fxcli.client import FxClient     # абсолютный: полный путь от корня пакета
from ..client import FxClient         # относительный: на уровень выше от текущего пакета
from .formatting import table         # относительный: модуль из того же пакета fxcli.cli
```

Одна точка — текущий пакет, две — родительский. Как Python вычисляет относительный путь, можно увидеть с помощью стандартной функции `importlib.util.resolve_name`:

```python
from importlib.util import resolve_name

print(resolve_name(".formatting", package="fxcli.cli"))
print(resolve_name("..client", package="fxcli.cli"))
print(resolve_name("..models.rates", package="fxcli.cli"))
```

```text
fxcli.cli.formatting
fxcli.client
fxcli.models.rates
```

Рекомендация PEP 8 — предпочитать **абсолютные** импорты: они понятнее при чтении. Относительные удобны внутри больших пакетов и при переименовании корня. Главное — не смешивать стили бессистемно.

Относительные импорты работают только внутри пакета. Если запустить файл пакета напрямую — `python fxcli/cli/commands.py` — получите `ImportError: attempted relative import with no known parent package`: для Python этот файл стал главным скриптом, а не частью пакета. Пакетные модули запускают через `-m`.

## `__name__` и запуск через `python -m`

У каждого модуля есть переменная `__name__`. При импорте это имя модуля (`"fxcli.client"`), а у файла, запущенного как программа, — `"__main__"`. Отсюда знакомая идиома:

```python
def main():
    print("запускаю CLI")


print("имя модуля:", __name__)

if __name__ == "__main__":
    main()
```

```text
имя модуля: __main__
запускаю CLI
```

Блок `if __name__ == "__main__":` выполняется только при прямом запуске и не выполняется при `import` — поэтому тесты могут импортировать модуль, не запуская программу.

Команда `python -m fxcli.client` запускает модуль **как часть пакета**: относительные импорты работают, а текущая папка добавляется в путь поиска. Если в пакете есть файл `__main__.py`, пакет запускается целиком: `python -m fxcli`.

```python norun
# fxcli/__main__.py
from fxcli.cli import main

raise SystemExit(main())
```

## Раскладка проекта: flat и src

Есть две общепринятые раскладки. **Flat** — пакет лежит в корне проекта:

```text
fxcli-project/
├── fxcli/
│   └── __init__.py
├── tests/
└── pyproject.toml
```

**src-layout** — пакет спрятан в папку `src/`:

```text
fxcli-project/
├── src/
│   └── fxcli/
│       ├── __init__.py
│       ├── __main__.py
│       ├── client.py
│       └── cli.py
├── tests/
│   ├── conftest.py
│   └── test_client.py
├── pyproject.toml
├── README.md
├── .gitignore
└── .env.example
```

src-layout рекомендуют для пакетов, которые устанавливаются: тесты импортируют **установленный** пакет, а не случайно подхваченную из текущей папки копию. Так ошибка «забыли включить файл в пакет» обнаруживается сразу, а не у пользователя. Для этого проект устанавливается в режиме разработки: `pip install -e .` (editable) — изменения в коде видны без переустановки.

## pyproject.toml: паспорт проекта

`pyproject.toml` — стандартный файл описания Python-проекта (PEP 518, 621). Формат — **TOML**: секции в квадратных скобках, пары `ключ = значение`, строки в кавычках, списки в `[]`:

```toml
[project]
name = "fxcli"
version = "0.1.0"
description = "Курсы валют в терминале"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
    "httpx>=0.27,<1.0",
    "pydantic>=2.5",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.5"]

[project.scripts]
fxcli = "fxcli.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 100
```

Разберём секции:

- **`[project]`** — метаданные: имя пакета для установки, версия, требования к Python и список **зависимостей** — библиотек, без которых пакет не работает.
- **`[project.optional-dependencies]`** — группы дополнительных зависимостей: `pip install -e ".[dev]"` установит ещё pytest и ruff для разработки.
- **`[project.scripts]`** — консольные команды: после установки в терминале появится команда `fxcli`, которая вызывает функцию `main` из модуля `fxcli.cli`.
- **`[build-system]`** — чем собирать пакет (hatchling, setuptools, poetry-core…).
- **`[tool.*]`** — настройки инструментов: pytest, ruff, mypy, black читают свои секции из этого же файла. Один файл вместо `setup.py`, `setup.cfg`, `pytest.ini`, `.flake8`.

Начиная с Python 3.11 TOML читается стандартным модулем `tomllib`:

```python
import tomllib

text = """
[project]
name = "fxcli"
version = "0.1.0"
dependencies = ["httpx>=0.27,<1.0", "pydantic>=2.5"]

[project.scripts]
fxcli = "fxcli.cli:main"
"""

data = tomllib.loads(text)
print(data["project"]["name"], data["project"]["version"])
print(data["project"]["dependencies"])
print(data["project"]["scripts"]["fxcli"])
```

```text
fxcli 0.1.0
['httpx>=0.27,<1.0', 'pydantic>=2.5']
fxcli.cli:main
```

## Версии и ограничения

Версии пакетов обычно следуют **семантическому версионированию** `MAJOR.MINOR.PATCH`: PATCH — исправления, MINOR — новые возможности без поломок, MAJOR — несовместимые изменения. Ограничения в зависимостях:

| Запись | Значение |
|---|---|
| `httpx==0.27.2` | ровно эта версия |
| `httpx>=0.27` | 0.27 и новее |
| `httpx>=0.27,<1.0` | от 0.27 до 1.0, не включая 1.0 |
| `httpx~=0.27.0` | совместимая: `>=0.27.0, <0.28` |
| `httpx!=0.27.1` | любая, кроме этой |

Версии сравнивают **покомпонентно как числа**, а не как строки: `"0.10" < "0.9"` для строк, но версия 0.10 новее 0.9:

```python
def parse(version):
    return tuple(int(part) for part in version.split("."))


print("0.10.0" > "0.9.0")
print(parse("0.10.0") > parse("0.9.0"))
print(parse("1.2") == parse("1.2.0"))
```

```text
False
True
False
```

Последняя строка — ловушка: кортежи `(1, 2)` и `(1, 2, 0)` разной длины не равны, хотя версии одинаковые. Перед сравнением короткую версию дополняют нулями.

В настоящих проектах сравнение версий делает библиотека `packaging` (`Version`, `SpecifierSet`), которой пользуется pip.

В `dependencies` библиотеки указывают **диапазоны** — чтобы пакет уживался с другими. А для воспроизводимости приложения нужны **точные** версии всех пакетов, включая зависимости зависимостей. Их фиксирует **lock-файл** (`uv.lock`, `poetry.lock`): на сервере и у коллег устанавливается ровно то же, что у вас.

## Виртуальные окружения

Каждому проекту — своё **виртуальное окружение** (venv): изолированная папка с интерпретатором и пакетами. Проекту A нужен `pydantic` 1, проекту B — `pydantic` 2, и они не мешают друг другу.

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

Папку `.venv` никогда не добавляют в git — её легко пересоздать из `pyproject.toml`.

## uv и poetry

Ручная работа с venv и pip — это много команд. Современные менеджеры проектов делают всё сразу: создают окружение, ставят зависимости, ведут lock-файл.

**uv** — быстрый менеджер (написан на Rust), сейчас фактический стандарт для новых проектов:

```bash
uv init fxcli --package          # проект с src-layout и pyproject.toml
cd fxcli
uv add httpx pydantic            # добавить зависимости (и обновить uv.lock)
uv add --dev pytest ruff         # зависимости для разработки
uv run pytest                    # запустить команду в окружении проекта
uv run fxcli convert 100 USD EUR
uv sync                          # установить всё строго по uv.lock
```

**poetry** — более старый и тоже популярный инструмент с похожими возможностями:

```bash
poetry new fxcli
poetry add httpx pydantic
poetry add --group dev pytest
poetry install
poetry run pytest
```

Оба записывают зависимости в `pyproject.toml` и фиксируют точные версии в lock-файле. Lock-файл приложения **коммитят** в git — именно он даёт воспроизводимость.

## Разбор задачи: из скрипта в пакет

Был файл `textkit.py` с функциями `slugify`, `word_count` и блоком `if __name__ == "__main__"`. Превратим его в устанавливаемый пакет:

```text
textkit/
├── pyproject.toml
├── src/textkit/
│   ├── __init__.py       # __version__ и публичные имена
│   ├── __main__.py       # python -m textkit
│   ├── core.py           # функции slugify, word_count
│   └── cli.py            # разбор аргументов, main()
└── tests/test_core.py
```

```python norun
# src/textkit/__init__.py
"""Утилиты для работы с текстом."""
from .core import slugify, word_count

__version__ = "0.1.0"
__all__ = ["slugify", "word_count", "__version__"]
```

```python norun
# src/textkit/cli.py
import sys

from textkit.core import slugify


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    print(slugify(" ".join(args)))
    return 0
```

```toml
# pyproject.toml
[project]
name = "textkit"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = []

[project.scripts]
textkit = "textkit.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

После `pip install -e .` работают и `import textkit`, и `python -m textkit Привет мир`, и просто `textkit Привет мир`. Логика (`core.py`) отделена от интерфейса (`cli.py`) — функции легко тестировать, а `main(argv)` принимает аргументы параметром, чтобы его можно было вызвать из теста.

## Попробуйте сами

1. Создайте пакет из двух модулей с абсолютным и относительным импортом и запустите модуль через `python -m`. Затем запустите тот же файл напрямую — какая ошибка?
2. Прочитайте `pyproject.toml` любого известного проекта на GitHub (httpx, pydantic, ruff). Найдите `dependencies`, `scripts`, секции `[tool.*]`.
3. Выполните `uv init demo --package` и посмотрите, какую структуру создал uv.

## Частые ошибки

- **Имя модуля совпадает со стандартным или установленным.** Файл `logging.py`, `random.py` или `httpx.py` в проекте «закрывает» настоящий модуль — `import httpx` импортирует ваш файл. Не называйте модули именами библиотек.
- **Запуск модуля пакета напрямую.** `python src/fxcli/cli.py` ломает относительные импорты; используйте `python -m fxcli.cli` или установленную команду.
- **Циклические импорты.** `client.py` импортирует `models.py`, а `models.py` — `client.py`: получаете `ImportError: cannot import name ... (most likely due to a circular import)`. Решение — вынести общее в третий модуль.
- **Зависимости «на глаз».** Библиотека установлена у вас, но не указана в `dependencies` — у коллеги программа падает с `ModuleNotFoundError`.
- **Жёсткие точные версии в библиотеке.** `pydantic==2.5.2` в `dependencies` библиотеки конфликтует с любым проектом, где нужна 2.6. Точные версии — в lock-файле, в `dependencies` — диапазоны.
- **Сравнение версий строками.** `"0.10" > "0.9"` ложно; версии сравнивают покомпонентно.
- **`.venv` в репозитории.** Сотни мегабайт, привязка к одной ОС — окружение пересоздают командой.

## Где это в AI-инженерии

- **Воспроизводимость экспериментов**: результат fine-tuning или оценки модели зависит от версий `torch`, `transformers`, токенизатора. Lock-файл фиксирует их — эксперимент можно повторить через полгода.
- **Сервисы с LLM**: типичная раскладка — `src/app/` с модулями `llm/` (клиенты провайдеров), `prompts/`, `rag/`, `api/` и тесты рядом; так код растёт без хаоса.
- **Docker и деплой**: образ собирают командой `uv sync --frozen` — строго по lock-файлу, быстро и одинаково на всех серверах (часть 7 курса).
- **Внутренние библиотеки**: общий клиент к LLM с повторами, логированием и подсчётом стоимости оформляют пакетом и подключают в разные сервисы как зависимость.
- **CLI-инструменты**: `[project.scripts]` превращает скрипт оценки моделей или загрузки данных в команду, которой пользуется вся команда.

## Итоги урока

- Модуль — файл `.py`, пакет — папка с модулями и `__init__.py`; `__init__.py` задаёт публичный интерфейс и версию.
- Импорты бывают абсолютные (`from fxcli.client import ...`) и относительные (`from .client import ...`); модули пакета запускают через `python -m`.
- `if __name__ == "__main__":` отделяет запуск программы от импорта; `__main__.py` делает пакет запускаемым.
- `pyproject.toml` описывает проект: метаданные, зависимости с диапазонами версий, консольные команды, систему сборки и настройки инструментов.
- Виртуальное окружение изолирует зависимости проекта; uv и poetry управляют окружением, зависимостями и lock-файлом, который даёт воспроизводимость.
