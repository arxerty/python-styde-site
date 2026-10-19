# Эталонное решение: fxcli

Ниже — полный код пакета после восьми этапов. Его можно скопировать в папку, выполнить `pip install -e ".[dev]"` и запустить `fxcli rates USD`.

```text
fxcli/
├── pyproject.toml
├── README.md
├── .env.example
├── .gitignore
├── src/fxcli/
│   ├── __init__.py      # версия
│   ├── __main__.py      # python -m fxcli
│   ├── config.py        # Settings, load_settings, ConfigError
│   ├── models.py        # Rates, TimeSeries, Currencies, normalize_code
│   ├── retry.py         # декоратор @retry
│   ├── cache.py         # FileCache
│   ├── client.py        # FxClient, ApiError
│   └── cli.py           # argparse, логирование, вывод
└── tests/
    ├── conftest.py      # FakeApi на httpx.MockTransport, фикстуры
    ├── test_stage1_package.py … test_stage8_quality.py
    └── test_my_cli.py   # тесты CLI с unittest.mock
```

## Как устроено решение

**Слои и зависимости.** Каждый модуль отвечает за одно и зависит только от модулей «ниже»: `models` и `config` ни от чего не зависят, `client` использует `models`, `retry` и (через параметр) кэш, `cli` собирает всё вместе. Поэтому каждый слой тестируется отдельно, а замена одного (другой API, Redis вместо файлового кэша) не трогает остальные.

**Внедрение зависимостей.** Всё, что связано с внешним миром, передаётся параметрами: httpx-клиент (`FxClient(settings, http=...)`), функция паузы (`sleep=...`), часы кэша (`clock=...`), окружение (`load_settings(environ=...)`), фабрика клиента и текущая дата (`main(client_factory=..., today=...)`). В работе используются значения по умолчанию, а тесты подставляют подделки — и ни один тест не ходит в сеть и не ждёт.

**Ошибки как данные.** Клиент сводит все сбои к `ApiError` с признаком `retryable`; декоратор `retry` по этому признаку решает, повторять ли запрос; `cli.main` превращает исключения в понятные сообщения и коды выхода (0/1/2). Пользователь никогда не видит traceback — подробности доступны в логе с ключом `-v`.

**Валидация на границе.** Всё, что приходит снаружи — переменные окружения и ответы API, — проверяется Pydantic-моделями сразу на входе. Дальше код работает с гарантированно корректными объектами.

**Потоки вывода.** Результат печатается в stdout, логи и ошибки — в stderr. `fxcli rates USD > rates.txt` сохраняет только данные.

**Асинхронность.** Одиночная команда делает один-два запроса, но клиент асинхронный: `latest_many` получает курсы нескольких валют одновременно через `asyncio.gather`, а тот же клиент без изменений подойдёт для веб-сервиса на FastAPI (часть 7).

## Код

### `pyproject.toml`

```toml
[project]
name = "fxcli"
version = "0.1.0"
description = "Курсы валют в терминале: асинхронный клиент Frankfurter API"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
    "httpx>=0.27,<1.0",
    "pydantic>=2.5,<3",
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
line-length = 120
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP"]
```

### `src/fxcli/__init__.py`

```python norun
"""fxcli — курсы валют в терминале."""

__version__ = "0.1.0"
```

### `src/fxcli/__main__.py`

```python norun
from fxcli.cli import main

raise SystemExit(main())
```

### `src/fxcli/config.py`

```python norun
"""Настройки fxcli: значения по умолчанию, файл .env и переменные окружения FXCLI_*."""

import os
from collections.abc import Mapping
from pathlib import Path

from dotenv import dotenv_values
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

PREFIX = "FXCLI_"
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")


class ConfigError(Exception):
    """Некорректная конфигурация."""


class Settings(BaseModel):
    """Настройки приложения (неизменяемые)."""

    model_config = ConfigDict(frozen=True)

    base_url: str = "https://api.frankfurter.dev/v1"
    timeout: float = Field(10.0, gt=0)
    retries: int = Field(3, ge=0, le=10)
    cache_dir: Path = Path.home() / ".cache" / "fxcli"
    cache_ttl: int = Field(3600, ge=0)
    log_level: str = "WARNING"

    @field_validator("base_url")
    @classmethod
    def check_base_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")):
            raise ValueError("адрес должен начинаться с http:// или https://")
        return value

    @field_validator("cache_dir")
    @classmethod
    def expand_cache_dir(cls, value: Path) -> Path:
        return value.expanduser()

    @field_validator("log_level")
    @classmethod
    def check_log_level(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in LOG_LEVELS:
            raise ValueError(f"уровень должен быть одним из: {', '.join(LOG_LEVELS)}")
        return value


def load_settings(env_file: str | Path | None = ".env", environ: Mapping[str, str] | None = None) -> Settings:
    """Собрать настройки: значения по умолчанию ← файл .env ← переменные окружения."""
    environ = os.environ if environ is None else environ
    raw: dict[str, str] = {}
    if env_file is not None and Path(env_file).is_file():
        raw.update({key: value for key, value in dotenv_values(env_file).items() if value is not None})
    raw.update(environ)
    values = {}
    for name in Settings.model_fields:
        value = raw.get(PREFIX + name.upper())
        if value is not None and value.strip():
            values[name] = value.strip()
    try:
        return Settings(**values)
    except ValidationError as error:
        names = ", ".join(PREFIX + str(item["loc"][0]).upper() for item in error.errors())
        raise ConfigError(f"некорректные значения: {names}") from error
```

### `src/fxcli/models.py`

```python norun
"""Pydantic-модели ответов Frankfurter API."""

import datetime as dt
import re
from statistics import mean

from pydantic import BaseModel, RootModel, field_validator

CODE = re.compile(r"[A-Z]{3}")


def normalize_code(code: str) -> str:
    """Код валюты от пользователя: ' usd ' -> 'USD'; не три латинские буквы → ValueError."""
    value = code.strip().upper()
    if not CODE.fullmatch(value):
        raise ValueError(f"некорректный код валюты: {code!r}")
    return value


def _check_code(code: str) -> str:
    if not CODE.fullmatch(code):
        raise ValueError(f"некорректный код валюты: {code!r}")
    return code


def _check_rates(rates: dict[str, float]) -> dict[str, float]:
    for code, value in rates.items():
        _check_code(code)
        if value <= 0:
            raise ValueError(f"курс должен быть положительным: {code}={value}")
    return rates


class Rates(BaseModel):
    """Курсы на одну дату: /latest и /ГГГГ-ММ-ДД."""

    amount: float = 1.0
    base: str
    date: dt.date
    rates: dict[str, float]

    @field_validator("base")
    @classmethod
    def check_base(cls, value: str) -> str:
        return _check_code(value)

    @field_validator("rates")
    @classmethod
    def check_rates(cls, value: dict[str, float]) -> dict[str, float]:
        return _check_rates(value)

    def rate(self, currency: str) -> float:
        """Сколько единиц currency стоит одна единица base."""
        if currency == self.base:
            return 1.0
        if currency not in self.rates:
            raise KeyError(currency)
        return self.rates[currency] / self.amount

    def convert(self, value: float, currency: str) -> float:
        """Пересчитать сумму в base в валюту currency."""
        return value * self.rate(currency)


class TimeSeries(BaseModel):
    """Курсы за период: /ГГГГ-ММ-ДД..ГГГГ-ММ-ДД."""

    amount: float = 1.0
    base: str
    start_date: dt.date
    end_date: dt.date
    rates: dict[dt.date, dict[str, float]]

    @field_validator("base")
    @classmethod
    def check_base(cls, value: str) -> str:
        return _check_code(value)

    @field_validator("rates")
    @classmethod
    def check_rates(cls, value: dict[dt.date, dict[str, float]]) -> dict[dt.date, dict[str, float]]:
        for day_rates in value.values():
            _check_rates(day_rates)
        return value

    def series(self, currency: str) -> list[tuple[dt.date, float]]:
        """Пары (дата, курс) по возрастанию дат; нет такой валюты → KeyError."""
        points = [
            (day, values[currency] / self.amount) for day, values in sorted(self.rates.items()) if currency in values
        ]
        if not points:
            raise KeyError(currency)
        return points

    def stats(self, currency: str) -> dict[str, float]:
        """Минимум, максимум, среднее, изменение в процентах и число дней."""
        values = [value for _, value in self.series(currency)]
        first, last = values[0], values[-1]
        return {
            "min": min(values),
            "max": max(values),
            "mean": round(mean(values), 6),
            "change_pct": round((last - first) / first * 100, 2),
            "days": len(values),
        }


class Currencies(RootModel[dict[str, str]]):
    """Список валют: код → название."""

    @field_validator("root")
    @classmethod
    def check_codes(cls, value: dict[str, str]) -> dict[str, str]:
        for code in value:
            _check_code(code)
        return value

    def names(self) -> dict[str, str]:
        """Словарь, отсортированный по коду."""
        return dict(sorted(self.root.items()))
```

### `src/fxcli/retry.py`

```python norun
"""Декоратор повторов для асинхронных функций."""

import asyncio
import functools
import logging

logger = logging.getLogger(__name__)


def retry(attempts=3, base_delay=0.5, max_delay=8.0, retry_on=(Exception,), sleep=asyncio.sleep):
    """Повторять вызов async-функции при временных ошибках.

    Повтор — если исключение из retry_on и его атрибут retryable (если он есть) истинен.
    Паузы: base_delay, 2·base_delay, 4·base_delay, ... но не больше max_delay.
    """
    if attempts < 1:
        raise ValueError("attempts должно быть не меньше 1")

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except retry_on as error:
                    if not getattr(error, "retryable", True) or attempt == attempts:
                        raise
                    delay = min(base_delay * 2 ** (attempt - 1), max_delay)
                    logger.warning(
                        "попытка %d из %d не удалась (%s), повтор через %.1f с",
                        attempt,
                        attempts,
                        error,
                        delay,
                    )
                    await sleep(delay)
            raise AssertionError("недостижимо")

        return wrapper

    return decorator
```

### `src/fxcli/cache.py`

```python norun
"""Файловый кэш ответов API с временем жизни записей."""

import hashlib
import json
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)


class FileCache:
    """JSON-файл на каждый ключ в папке directory; ttl в секундах, 0 — кэш выключен."""

    def __init__(self, directory, ttl, clock=time.time):
        if ttl < 0:
            raise ValueError("ttl не может быть отрицательным")
        self.directory = Path(directory)
        self.ttl = ttl
        self.clock = clock

    def _path(self, key: str) -> Path:
        return self.directory / (hashlib.sha256(key.encode("utf-8")).hexdigest() + ".json")

    def get(self, key: str):
        """Значение или None, если записи нет, она устарела или повреждена."""
        if self.ttl == 0:
            return None
        path = self._path(key)
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (OSError, ValueError):
            logger.warning("повреждённая запись кэша: %s", path.name)
            return None
        if not isinstance(entry, dict) or entry.get("key") != key:
            logger.warning("повреждённая запись кэша: %s", path.name)
            return None
        if self.clock() - entry.get("saved_at", 0) >= self.ttl:
            return None
        return entry.get("value")

    def set(self, key: str, value) -> None:
        """Сохранить значение (оно должно сериализоваться в JSON)."""
        if self.ttl == 0:
            return
        self.directory.mkdir(parents=True, exist_ok=True)
        entry = {"key": key, "saved_at": self.clock(), "value": value}
        self._path(key).write_text(json.dumps(entry, ensure_ascii=False), encoding="utf-8")

    def clear(self) -> int:
        """Удалить все записи и вернуть их число."""
        if not self.directory.exists():
            return 0
        count = 0
        for path in self.directory.glob("*.json"):
            path.unlink()
            count += 1
        return count
```

### `src/fxcli/client.py`

```python norun
"""Асинхронный клиент Frankfurter API."""

import asyncio
import datetime as dt
import logging
from urllib.parse import urlencode

import httpx
from pydantic import ValidationError

from fxcli.config import Settings
from fxcli.models import Currencies, Rates, TimeSeries
from fxcli.retry import retry

logger = logging.getLogger(__name__)


class ApiError(Exception):
    """Ошибка обращения к API; retryable — имеет ли смысл повторить запрос."""

    def __init__(self, message: str, status: int | None = None, retryable: bool = False) -> None:
        super().__init__(message)
        self.status = status
        self.retryable = retryable


def _error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        data = None
    if isinstance(data, dict) and data.get("message"):
        return str(data["message"])
    return response.reason_phrase or "ошибка"


class FxClient:
    """Клиент API курсов валют. Используется как async with FxClient(settings) as client."""

    def __init__(self, settings: Settings, http=None, cache=None, sleep=asyncio.sleep) -> None:
        self.settings = settings
        self.cache = cache
        self._http = http
        self._owns_http = http is None
        self._get_with_retry = retry(attempts=settings.retries + 1, retry_on=(ApiError,), sleep=sleep)(self._get_once)

    async def __aenter__(self) -> "FxClient":
        if self._http is None:
            self._http = httpx.AsyncClient(base_url=self.settings.base_url, timeout=self.settings.timeout)
        return self

    async def __aexit__(self, *exc_info) -> None:
        if self._owns_http and self._http is not None:
            await self._http.aclose()
            self._http = None

    async def get_json(self, path: str, params: dict | None = None):
        """GET-запрос с кэшем и повторами; возвращает разобранный JSON."""
        params = {key: value for key, value in (params or {}).items() if value not in (None, "")}
        key = f"{path}?{urlencode(sorted(params.items()))}"
        if self.cache is not None:
            cached = self.cache.get(key)
            if cached is not None:
                logger.debug("из кэша: %s", key)
                return cached
        data = await self._get_with_retry(path, params)
        if self.cache is not None:
            self.cache.set(key, data)
        return data

    async def _get_once(self, path: str, params: dict):
        if self._http is None:
            raise RuntimeError("используйте клиент внутри async with")
        logger.debug("GET %s %s", path, params)
        try:
            response = await self._http.get(path, params=params)
        except httpx.TimeoutException as error:
            raise ApiError("сервер не ответил вовремя", retryable=True) from error
        except httpx.TransportError as error:
            raise ApiError(f"сетевая ошибка: {error}", retryable=True) from error
        if response.status_code == 200:
            return response.json()
        retryable = response.status_code == 429 or response.status_code >= 500
        raise ApiError(
            f"HTTP {response.status_code}: {_error_message(response)}",
            status=response.status_code,
            retryable=retryable,
        )

    @staticmethod
    def _validate(model, data):
        try:
            return model.model_validate(data)
        except ValidationError as error:
            raise ApiError(f"неожиданный ответ API: {error.error_count()} ошибок формата") from error

    async def latest(self, base: str, symbols=()) -> Rates:
        """Последние курсы base к валютам symbols (пусто — ко всем)."""
        data = await self.get_json("/latest", {"base": base, "symbols": ",".join(symbols)})
        return self._validate(Rates, data)

    async def historical(self, day: dt.date, base: str, symbols=()) -> Rates:
        """Курсы на дату day."""
        data = await self.get_json(f"/{day.isoformat()}", {"base": base, "symbols": ",".join(symbols)})
        return self._validate(Rates, data)

    async def timeseries(self, start: dt.date, end: dt.date, base: str, symbols=()) -> TimeSeries:
        """Курсы за период от start до end включительно."""
        if end < start:
            raise ValueError("дата окончания раньше даты начала")
        path = f"/{start.isoformat()}..{end.isoformat()}"
        data = await self.get_json(path, {"base": base, "symbols": ",".join(symbols)})
        return self._validate(TimeSeries, data)

    async def currencies(self) -> Currencies:
        """Все поддерживаемые валюты."""
        return self._validate(Currencies, await self.get_json("/currencies"))

    async def latest_many(self, bases, symbols=()) -> dict[str, Rates]:
        """Последние курсы для нескольких базовых валют — запросы идут одновременно."""
        results = await asyncio.gather(*(self.latest(base, symbols) for base in bases))
        return dict(zip(bases, results, strict=True))
```

### `src/fxcli/cli.py`

```python norun
"""Командная строка fxcli."""

import argparse
import asyncio
import datetime as dt
import logging
import sys

from fxcli import __version__
from fxcli.cache import FileCache
from fxcli.client import ApiError, FxClient
from fxcli.config import ConfigError, Settings, load_settings
from fxcli.models import Currencies, Rates, TimeSeries, normalize_code

logger = logging.getLogger("fxcli")


def build_parser() -> argparse.ArgumentParser:
    """Аргументы командной строки."""
    parser = argparse.ArgumentParser(prog="fxcli", description="Курсы валют в терминале")
    parser.add_argument("--version", action="version", version=f"fxcli {__version__}")
    parser.add_argument("-v", "--verbose", action="store_true", help="подробный лог (DEBUG)")
    parser.add_argument("--no-cache", action="store_true", help="не использовать кэш")
    parser.add_argument("--env-file", default=".env", help="путь к файлу .env")
    commands = parser.add_subparsers(dest="command", required=True)

    rates = commands.add_parser("rates", help="курсы базовой валюты")
    rates.add_argument("base", help="базовая валюта, например USD")
    rates.add_argument("--to", nargs="+", default=[], metavar="CODE", help="только эти валюты")
    rates.add_argument("--date", type=dt.date.fromisoformat, help="дата ГГГГ-ММ-ДД")

    convert = commands.add_parser("convert", help="пересчитать сумму")
    convert.add_argument("amount", type=float)
    convert.add_argument("source")
    convert.add_argument("target")
    convert.add_argument("--date", type=dt.date.fromisoformat, help="дата ГГГГ-ММ-ДД")

    history = commands.add_parser("history", help="динамика курса за период")
    history.add_argument("base")
    history.add_argument("target")
    history.add_argument("--start", type=dt.date.fromisoformat, required=True)
    history.add_argument("--end", type=dt.date.fromisoformat, help="по умолчанию — сегодня")

    commands.add_parser("currencies", help="список валют")
    return parser


def setup_logging(level: str) -> None:
    """Логи — в stderr; шумный httpx — не подробнее WARNING, если не включён DEBUG."""
    logging.basicConfig(
        level=level,
        stream=sys.stderr,
        format="%(levelname)s %(name)s: %(message)s",
        force=True,
    )
    logging.getLogger("httpx").setLevel(logging.DEBUG if level == "DEBUG" else logging.WARNING)


def make_client(settings: Settings, no_cache: bool = False) -> FxClient:
    """Клиент по умолчанию: с файловым кэшем, если он не выключен."""
    cache = None
    if not no_cache and settings.cache_ttl > 0:
        cache = FileCache(settings.cache_dir, settings.cache_ttl)
    return FxClient(settings, cache=cache)


def format_rates(rates: Rates) -> list[str]:
    lines = [f"Курсы {rates.base} на {rates.date.isoformat()}"]
    lines += [f"  {code}  {rates.rate(code):.4f}" for code in sorted(rates.rates)]
    return lines


def format_conversion(amount: float, source: str, target: str, rates: Rates) -> list[str]:
    rate = rates.rate(target)
    return [f"{amount:.2f} {source} = {amount * rate:.2f} {target} (курс {rate:.4f} на {rates.date.isoformat()})"]


def format_history(series: TimeSeries, target: str) -> list[str]:
    lines = [f"{day.isoformat()}  {value:.4f}" for day, value in series.series(target)]
    stats = series.stats(target)
    lines.append(
        f"мин {stats['min']:.4f}  макс {stats['max']:.4f}  "
        f"среднее {stats['mean']:.4f}  изменение {stats['change_pct']:+.2f}%"
    )
    return lines


def format_currencies(currencies: Currencies) -> list[str]:
    return [f"{code}  {name}" for code, name in currencies.names().items()]


async def run_command(args, settings: Settings, client_factory, today: dt.date) -> list[str]:
    """Выполнить команду и вернуть строки для вывода."""
    async with client_factory(settings) as client:
        if args.command == "rates":
            base = normalize_code(args.base)
            symbols = [normalize_code(code) for code in args.to]
            if args.date:
                rates = await client.historical(args.date, base, symbols)
            else:
                rates = await client.latest(base, symbols)
            return format_rates(rates)
        if args.command == "convert":
            source, target = normalize_code(args.source), normalize_code(args.target)
            if args.date:
                rates = await client.historical(args.date, source, [target])
            else:
                rates = await client.latest(source, [target])
            return format_conversion(args.amount, source, target, rates)
        if args.command == "history":
            base, target = normalize_code(args.base), normalize_code(args.target)
            series = await client.timeseries(args.start, args.end or today, base, [target])
            return format_history(series, target)
        return format_currencies(await client.currencies())


def main(argv=None, client_factory=None, today: dt.date | None = None) -> int:
    """Точка входа. Коды выхода: 0 — успех, 1 — ошибка запроса или данных, 2 — конфигурация."""
    args = build_parser().parse_args(argv)
    try:
        settings = load_settings(args.env_file)
    except ConfigError as error:
        print(f"Ошибка конфигурации: {error}", file=sys.stderr)
        return 2
    setup_logging("DEBUG" if args.verbose else settings.log_level)
    if client_factory is None:

        def client_factory(current: Settings) -> FxClient:
            return make_client(current, no_cache=args.no_cache)

    try:
        lines = asyncio.run(run_command(args, settings, client_factory, today or dt.date.today()))
    except ApiError as error:
        logger.debug("ошибка API", exc_info=True)
        print(f"Ошибка API: {error}", file=sys.stderr)
        return 1
    except KeyError as error:
        print(f"Ошибка: валюты {error.args[0]} нет в ответе API", file=sys.stderr)
        return 1
    except ValueError as error:
        print(f"Ошибка: {error}", file=sys.stderr)
        return 1
    for line in lines:
        print(line)
    return 0
```

### `.env.example`

```bash
# Настройки fxcli. Скопируйте файл в .env и при необходимости измените значения.
FXCLI_BASE_URL=https://api.frankfurter.dev/v1
FXCLI_TIMEOUT=10
FXCLI_RETRIES=3
FXCLI_CACHE_DIR=~/.cache/fxcli
FXCLI_CACHE_TTL=3600
FXCLI_LOG_LEVEL=WARNING
```

### `.gitignore`

```text
# окружение и кэши
.venv/
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/

# артефакты сборки
dist/
build/
*.egg-info/

# секреты и локальные настройки
.env
!.env.example
```

### `tests/conftest.py`

```python norun
"""Общие фикстуры тестов fxcli. Не меняйте этот файл."""

import asyncio
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))  # тесты работают и без pip install -e .

LATEST_USD = {"amount": 1.0, "base": "USD", "date": "2026-10-16", "rates": {"EUR": 0.92, "GBP": 0.79, "JPY": 151.3}}
HISTORICAL_USD = {"amount": 1.0, "base": "USD", "date": "2026-01-02", "rates": {"EUR": 0.95}}
SERIES_USD_EUR = {
    "amount": 1.0,
    "base": "USD",
    "start_date": "2026-10-01",
    "end_date": "2026-10-05",
    "rates": {"2026-10-05": {"EUR": 0.93}, "2026-10-01": {"EUR": 0.9}, "2026-10-02": {"EUR": 0.92}},
}
CURRENCIES = {"USD": "United States Dollar", "EUR": "Euro", "GBP": "British Pound"}


class FakeApi:
    """Подмена Frankfurter API через httpx.MockTransport.

    add(path, *ответы): ответ — (статус, json) или функция request -> Response (может бросить исключение).
    Ответы выдаются по очереди, последний повторяется. calls — список (путь, параметры) запросов.
    """

    def __init__(self, delay: float = 0.0) -> None:
        self.delay = delay
        self.calls: list[tuple[str, dict]] = []
        self.routes: dict[str, list] = {}
        self.active = 0
        self.peak = 0

    def add(self, path: str, *responses) -> None:
        self.routes[path] = list(responses)

    async def handler(self, request):
        import httpx

        path = request.url.path.removeprefix("/v1")
        self.calls.append((path, dict(request.url.params)))
        self.active += 1
        self.peak = max(self.peak, self.active)
        try:
            if self.delay:
                await asyncio.sleep(self.delay)
            items = self.routes.get(path)
            if not items:
                return httpx.Response(404, json={"message": "not found"})
            item = items.pop(0) if len(items) > 1 else items[0]
            if callable(item):
                return item(request)
            status, payload = item
            return httpx.Response(status, json=payload)
        finally:
            self.active -= 1

    def http(self):
        import httpx

        return httpx.AsyncClient(base_url="https://api.test/v1", transport=httpx.MockTransport(self.handler))


@pytest.fixture
def fake_api() -> FakeApi:
    api = FakeApi()
    api.add("/latest", (200, LATEST_USD))
    api.add("/currencies", (200, CURRENCIES))
    api.add("/2026-01-02", (200, HISTORICAL_USD))
    api.add("/2026-10-01..2026-10-05", (200, SERIES_USD_EUR))
    return api


@pytest.fixture
def settings(tmp_path):
    from fxcli.config import Settings

    return Settings(base_url="https://api.test/v1", retries=0, cache_dir=tmp_path / "cache", cache_ttl=60)


async def no_sleep(delay: float) -> None:
    """Подмена asyncio.sleep для тестов повторов: не ждать."""
```

### `tests/test_my_cli.py`

```python norun
"""Тесты командной строки с подменой клиента через unittest.mock."""

import datetime as dt
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from fxcli.cli import main
from fxcli.client import ApiError
from fxcli.models import Rates

RATES = Rates(base="USD", date=dt.date(2026, 10, 16), rates={"EUR": 0.9, "GBP": 0.8})


@pytest.fixture(autouse=True)
def clean_env(tmp_path, monkeypatch):
    """Без .env и переменных FXCLI_* из окружения разработчика."""
    monkeypatch.chdir(tmp_path)
    for key in [
        "FXCLI_BASE_URL",
        "FXCLI_TIMEOUT",
        "FXCLI_RETRIES",
        "FXCLI_CACHE_DIR",
        "FXCLI_CACHE_TTL",
        "FXCLI_LOG_LEVEL",
    ]:
        monkeypatch.delenv(key, raising=False)


def fake_client(**methods):
    """MagicMock, который работает как async with и возвращает заданные значения методов."""
    client = MagicMock()
    client.__aenter__.return_value = client
    for name, value in methods.items():
        setattr(client, name, AsyncMock(**{"side_effect" if isinstance(value, Exception) else "return_value": value}))
    return client


def test_rates_calls_latest_with_normalized_codes(capsys):
    client = fake_client(latest=RATES)
    with patch("fxcli.cli.FxClient", return_value=client):
        assert main(["--no-cache", "rates", "usd", "--to", "eur"]) == 0
    client.latest.assert_awaited_once_with("USD", ["EUR"])
    assert "EUR  0.9000" in capsys.readouterr().out


def test_rates_with_date_calls_historical():
    client = fake_client(historical=RATES)
    with patch("fxcli.cli.FxClient", return_value=client):
        assert main(["rates", "USD", "--date", "2026-01-02"]) == 0
    client.historical.assert_awaited_once_with(dt.date(2026, 1, 2), "USD", [])
    client.latest.assert_not_called()


def test_convert_output(capsys):
    client = fake_client(latest=RATES)
    with patch("fxcli.cli.FxClient", return_value=client):
        assert main(["convert", "10", "USD", "GBP"]) == 0
    assert capsys.readouterr().out == "10.00 USD = 8.00 GBP (курс 0.8000 на 2026-10-16)\n"


def test_api_error_exit_code(capsys):
    client = fake_client(latest=ApiError("HTTP 503: unavailable", status=503, retryable=True))
    with patch("fxcli.cli.FxClient", return_value=client):
        assert main(["rates", "USD"]) == 1
    captured = capsys.readouterr()
    assert captured.out == "" and "503" in captured.err


def test_no_cache_flag_passes_none():
    client = fake_client(currencies=MagicMock(names=MagicMock(return_value={})))
    with patch("fxcli.cli.FxClient", return_value=client) as fx_client:
        main(["--no-cache", "currencies"])
    assert fx_client.call_args.kwargs["cache"] is None


def test_cache_enabled_by_default(tmp_path, monkeypatch):
    monkeypatch.setenv("FXCLI_CACHE_DIR", str(tmp_path / "cache"))
    client = fake_client(currencies=MagicMock(names=MagicMock(return_value={})))
    with patch("fxcli.cli.FxClient", return_value=client) as fx_client:
        main(["currencies"])
    cache = fx_client.call_args.kwargs["cache"]
    assert cache is not None and cache.directory == tmp_path / "cache"


def test_history_uses_today_by_default():
    client = fake_client(timeseries=KeyError("EUR"))
    with patch("fxcli.cli.FxClient", return_value=client):
        assert main(["history", "USD", "EUR", "--start", "2026-10-01"], today=dt.date(2026, 10, 10)) == 1
    client.timeseries.assert_awaited_once_with(dt.date(2026, 10, 1), dt.date(2026, 10, 10), "USD", ["EUR"])
```

Тесты этапов (`tests/test_stage1_package.py` … `tests/test_stage8_quality.py`) — в архивах этапов; README — в решении этапа 8.
