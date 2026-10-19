# Шпаргалка: тесты, структура проекта, git

## pytest

```python norun
import pytest

def test_cost():                                   # файл test_*.py, функция test_*
    assert request_cost("mini", 1000, 0) == pytest.approx(0.00015)

def test_errors():
    with pytest.raises(ValueError, match="диапазон"):
        parse_temperature("3")
```

| Команда | Что делает |
|---|---|
| `pytest -q` / `-v` | коротко / подробно |
| `pytest file.py::test_x` | один тест |
| `pytest -k cache` | тесты с «cache» в имени |
| `pytest -x`, `--lf` | стоп на первом падении, только упавшие |
| `pytest -s` | показывать `print` |
| `pytest -m "not slow"` | исключить метку |

- Тест: одно поведение, говорящее имя, Arrange — Act — Assert, без сети и случайности.
- Проверяйте обычные случаи, **границы** (0, пусто, ровно на границе), ошибки и особые данные.

## Фикстуры и параметризация

```python norun
@pytest.fixture                        # scope="function" | "module" | "session"
def history_file(tmp_path, monkeypatch):
    path = tmp_path / "history.json"
    monkeypatch.setenv("CHAT_HISTORY", str(path))
    yield path                         # до yield — подготовка, после — уборка
    # уборка выполняется даже при падении теста

@pytest.mark.parametrize("text, expected", [
    ("10KB", 10240),
    pytest.param("1 TB", 2**40, marks=pytest.mark.xfail, id="tb"),
])
def test_parse_size(text, expected):
    assert parse_size(text) == expected
```

- Фикстуру получают **параметром**; общие — в `conftest.py`, импортировать не нужно.
- Встроенные: `tmp_path`, `monkeypatch` (`setenv`, `setattr`), `capsys` (`readouterr().out`), `caplog`.
- Стопка `parametrize` — все комбинации; `@pytest.fixture(params=[...])` + `request.param`.

## Моки

```python norun
from unittest.mock import Mock, AsyncMock, call, patch

client = Mock(spec=LLMClient)
client.complete.return_value = "ответ"
client.complete.side_effect = [TimeoutError(), "ответ"]   # по очереди; исключение — бросить
client.complete.assert_called_once_with("Привет", temperature=0)
sleep.call_args_list == [call(1), call(2)]

with patch("weather.httpx.get", return_value=response) as fake_get:   # где ИЩУТ имя
    weather.current("Казань")
fake_get.call_args.kwargs["params"]
```

- Проще всего мокать то, что **передано параметром** (клиент, `sleep`, часы).
- `from rates import get_rate` в `converter.py` → `patch("converter.get_rate")`.
- Мокают границы системы: сеть, диск, время, случайность. `spec`/`autospec` — защита от опечаток.

## Пакет и pyproject.toml

```text
project/
├── src/fxcli/{__init__.py, __main__.py, cli.py, client.py}
├── tests/{conftest.py, test_client.py}
├── pyproject.toml   README.md   .gitignore   .env.example
```

```toml
[project]
name = "fxcli"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["httpx>=0.27,<1.0", "pydantic>=2.5"]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff>=0.5"]

[project.scripts]
fxcli = "fxcli.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- `from .client import X` — относительный импорт; модули пакета запускают `python -m fxcli`.
- `if __name__ == "__main__":` — только при прямом запуске; `__main__.py` — для `python -m пакет`.
- `pip install -e ".[dev]"`; uv: `uv init --package`, `uv add`, `uv add --dev`, `uv run`, `uv sync`.
- В `dependencies` — диапазоны, точные версии — в lock-файле (коммитить). `~=0.27.0` = `>=0.27.0,<0.28`.
- Версии сравнивают покомпонентно числами: 0.10 > 0.9.

## logging

```python norun
import logging
logger = logging.getLogger(__name__)          # в каждом модуле

logger.debug("промпт: %r", prompt)            # аргументы отдельно, не f-строкой
logger.warning("повтор %d из %d", attempt, total)
try:
    ...
except ValueError:
    logger.exception("не разобрать ответ")    # ERROR + traceback

# только в точке входа приложения:
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
```

- Уровни: DEBUG 10 < INFO 20 < WARNING 30 < ERROR 40 < CRITICAL 50.
- Logger → Handler (куда) → Formatter (как), Filter (отбор/маскировка); записи идут вверх по иерархии.
- Логи — в stderr, результат программы — в stdout. Секреты в логах маскируют.
- Тесты: `caplog.set_level(logging.DEBUG, logger="app")`, `caplog.records`, `caplog.text`.

## Стиль: PEP 8, ruff, pre-commit

| Что | Стиль |
|---|---|
| функции, переменные, модули | `snake_case` |
| классы | `CapWords` |
| константы | `UPPER_SNAKE_CASE` |

```bash
ruff check . --fix      # линтер (+ автоисправления)
ruff format .           # форматтер (как black)
pre-commit install      # проверки перед каждым коммитом
pre-commit run --all-files
```

- Импорты: стандартная библиотека / сторонние / свои; `is None`; без голого `except:`; без `def f(x=[])`.
- Настройки — в `[tool.ruff]` в `pyproject.toml`; `# noqa: КОД` — только точечно и с причиной.

## git

```bash
git init / git clone URL
git status / git diff / git diff --staged
git add файл / git commit -m "feat(cli): добавить history"
git log --oneline --graph
git switch -c feature/x / git switch main
git merge feature/x            # fast-forward или merge-коммит; конфликт → правка, add, commit
git push -u origin feature/x / git pull / git fetch
git restore файл / git restore --staged файл / git revert <хэш> / git stash
```

```text
# .gitignore
.venv/
__pycache__/
*.pyc
dist/
.env
!.env.example
```

- Коммит — одно логическое изменение с понятным сообщением; Conventional Commits: `feat`, `fix`, `docs`, `refactor`, `!` — несовместимо.
- `.gitignore` не действует на уже отслеживаемые файлы (`git rm --cached`); утёкший ключ — **отозвать**.
- Командный процесс: ветка → push → pull request → CI (ruff, pytest) → ревью → merge.
