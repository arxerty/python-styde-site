# Переменные окружения и .env: конфигурация и секреты

## Где хранить API-ключ

В прошлом уроке мы отправляли запросы с заголовком `Authorization: Bearer <ключ>`. Откуда программа берёт ключ? Самый простой и самый плохой вариант — записать его прямо в код:

```python norun
API_KEY = "sk-live-8f3a..."  # так делать нельзя
```

Проблемы:

- код попадает в git, а из git — на GitHub, к коллегам, в резервные копии. Боты сканируют публичные репозитории и находят утёкшие ключи за минуты; по украденному ключу LLM-провайдера можно потратить тысячи долларов за ночь;
- удалить ключ из истории git очень трудно — он остаётся в старых коммитах;
- у разработчика, тестового сервера и продакшена ключи и настройки разные, а код должен быть одним.

Принцип, которому следуют почти все современные приложения (его формулирует методология «12 факторов»): **конфигурация отделена от кода и хранится в переменных окружения**.

## Переменные окружения

**Переменная окружения** — пара «имя = строка», которую операционная система передаёт каждому запущенному процессу. Их задают в терминале, в настройках сервера, в Docker, в CI. Вы уже встречали `PATH` — список каталогов, где искать программы.

Задать переменную в терминале:

```bash
# Linux / macOS
export LLM_API_KEY="sk-test-123"
python app.py

# Windows PowerShell
$env:LLM_API_KEY = "sk-test-123"
python app.py
```

В Python переменные окружения доступны через словарь `os.environ`:

```python
import os

os.environ["APP_MODE"] = "dev"          # задать (для текущего процесса и его потомков)
print(os.environ["APP_MODE"])
print(os.environ.get("APP_MISSING"))         # нет переменной — None
print(os.getenv("APP_MISSING", "default"))   # значение по умолчанию
print("APP_MODE" in os.environ)
```

```text
dev
None
default
True
```

- `os.environ["NAME"]` — бросает `KeyError`, если переменной нет; используйте для **обязательных** настроек;
- `os.getenv("NAME", default)` (то же, что `os.environ.get`) — для **необязательных** со значением по умолчанию;
- изменение `os.environ` влияет только на текущий процесс и процессы, которые он запустит; окружение терминала, из которого вы запустили Python, не меняется.

## Всё — строки

Самая частая ловушка: значения переменных окружения **всегда строки**. Числа, логические флаги и списки нужно преобразовать самостоятельно:

```python
import os

os.environ["MAX_TOKENS"] = "512"
os.environ["DEBUG"] = "false"

print(os.environ["MAX_TOKENS"] + "0")
print(int(os.environ["MAX_TOKENS"]) + 10)
print(bool(os.environ["DEBUG"]))
```

```text
5120
522
True
```

`bool("false")` — это `True`, потому что строка непустая! Логические флаги разбирают явно, по списку допустимых значений:

```python
TRUE_VALUES = {"1", "true", "yes", "on"}
FALSE_VALUES = {"0", "false", "no", "off", ""}


def parse_bool(value):
    normalized = value.strip().lower()
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    raise ValueError(f"не логическое значение: {value!r}")


print(parse_bool("False"), parse_bool(" YES "), parse_bool("1"))
```

```text
False True True
```

Неизвестное значение вроде `"ture"` (опечатка) лучше сразу превратить в ошибку, чем молча считать `False`.

## Файл .env

Задавать десяток переменных в терминале перед каждым запуском неудобно. Поэтому при разработке их записывают в файл **`.env`** в корне проекта:

```text
# .env — НЕ коммитится в git
LLM_API_KEY=sk-test-123
LLM_BASE_URL=https://api.example.com/v1
LLM_TIMEOUT=30
MAX_CONCURRENCY=5
DEBUG=true
```

Формат простой: по одной паре `ИМЯ=значение` в строке, комментарии начинаются с `#`, значения можно брать в кавычки. Имена переменных принято писать `ВЕРХНИМ_РЕГИСТРОМ` с подчёркиваниями.

Сам Python файл `.env` не читает — его загружает библиотека **python-dotenv**:

```bash
pip install python-dotenv
```

```python norun
import os

from dotenv import load_dotenv

load_dotenv()   # ищет .env и добавляет переменные в os.environ
api_key = os.environ["LLM_API_KEY"]
```

Важная деталь: по умолчанию `load_dotenv()` **не перезаписывает** переменные, которые уже заданы в окружении. Это правильно: на сервере ключ задают настоящей переменной окружения, и случайно попавший туда `.env` не должен её подменить. Если нужно обратное — `load_dotenv(override=True)`.

Если не хочется трогать `os.environ`, можно прочитать файл в словарь:

```python
from pathlib import Path
import tempfile

from dotenv import dotenv_values

with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / ".env"
    path.write_text('# настройки\nMODEL=mini\nGREETING="Привет, мир"\nexport RETRIES=3\n', encoding="utf-8")
    print(dict(dotenv_values(path)))
```

```text
{'MODEL': 'mini', 'GREETING': 'Привет, мир', 'RETRIES': '3'}
```

`dotenv_values` возвращает упорядоченный словарь (`OrderedDict`), поэтому для наглядной печати мы превратили его в обычный `dict`. Комментарий пропущен, кавычки сняты, префикс `export` (его пишут, чтобы файл можно было подключить и в bash) отброшен, а значения — по-прежнему строки.

## .env.example и .gitignore

Два правила, без которых `.env` опасен:

1. **`.env` добавляют в `.gitignore`**, чтобы он никогда не попал в репозиторий:

   ```text
   # .gitignore
   .env
   .env.*
   !.env.example
   ```

2. **В репозиторий кладут `.env.example`** — тот же список переменных, но без настоящих секретов. Новый разработчик копирует его в `.env` и вписывает свои значения:

   ```text
   # .env.example
   LLM_API_KEY=            # обязательно: ключ провайдера
   LLM_BASE_URL=https://api.example.com/v1
   LLM_TIMEOUT=30
   MAX_CONCURRENCY=5
   DEBUG=false
   ```

`.env.example` — это документация: по нему видно, какие настройки есть у приложения и какие из них обязательны.

Если ключ всё-таки попал в git, удалить файл недостаточно: ключ нужно **немедленно отозвать** в панели провайдера и выпустить новый.

## Объект настроек

Читать `os.environ` по всему коду — плохая идея: имена переменных расползаются по модулям, преобразования типов дублируются, а об отсутствующем ключе программа узнаёт посреди работы. Лучше собрать конфигурацию **в одном месте при старте** и проверить сразу всё:

```python
from dataclasses import dataclass


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Settings:
    api_key: str
    base_url: str = "https://api.example.com/v1"
    timeout: float = 30.0
    max_concurrency: int = 5


def load_settings(env):
    errors = []
    api_key = env.get("LLM_API_KEY", "")
    if not api_key:
        errors.append("LLM_API_KEY: обязательная переменная")
    try:
        timeout = float(env.get("LLM_TIMEOUT", "30"))
    except ValueError:
        errors.append(f"LLM_TIMEOUT: не число: {env['LLM_TIMEOUT']!r}")
        timeout = 0.0
    if errors:
        raise ConfigError("; ".join(errors))
    return Settings(api_key=api_key, timeout=timeout,
                    base_url=env.get("LLM_BASE_URL", Settings.base_url))


print(load_settings({"LLM_API_KEY": "sk-1", "LLM_TIMEOUT": "12.5"}))
try:
    load_settings({"LLM_TIMEOUT": "много"})
except ConfigError as error:
    print("ошибка:", error)
```

```text
Settings(api_key='sk-1', base_url='https://api.example.com/v1', timeout=12.5, max_concurrency=5)
ошибка: LLM_API_KEY: обязательная переменная; LLM_TIMEOUT: не число: 'много'
```

Обратите внимание на решения:

- функция принимает `env` **параметром** (в программе передают `os.environ`, в тестах — обычный словарь) — тот же приём внедрения зависимостей, что с HTTP-клиентом;
- ошибки **собираются все сразу**, а не по одной: пользователь исправит конфигурацию за один раз;
- `frozen=True` — настройки нельзя случайно изменить во время работы;
- программа падает **при старте** с понятным сообщением, а не через час на первом запросе.

## pydantic-settings

То, что мы написали вручную, в готовом виде делает библиотека **pydantic-settings** — надстройка над Pydantic из блока 2.5. Описываете поля с типами, а она читает переменные окружения и `.env`, преобразует типы и проверяет значения:

```python norun
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LLM_")

    api_key: SecretStr                       # обязательная, LLM_API_KEY
    base_url: str = "https://api.example.com/v1"
    timeout: float = 30.0
    max_concurrency: int = Field(5, ge=1, le=100)
    debug: bool = False                      # понимает true/false/1/0/yes/no


settings = Settings()
print(settings.timeout, settings.api_key)            # 30.0 **********
key = settings.api_key.get_secret_value()            # настоящее значение — явно
```

`SecretStr` прячет значение при печати и в логах: случайный `print(settings)` не раскроет ключ. Это важная мелочь — секреты чаще всего утекают именно через логи и сообщения об ошибках.

## Разбор задачи: маскировка секретов в логах

При старте приложения полезно вывести конфигурацию в лог — но без секретов. Напишем функцию, которая скрывает значения переменных с «опасными» словами в имени:

```python
SECRET_MARKERS = ("KEY", "TOKEN", "SECRET", "PASSWORD")


def mask(value):
    if len(value) < 12:
        return "***"
    return f"{value[:3]}...{value[-4:]}"


def describe(env, prefix="LLM_"):
    lines = []
    for name in sorted(env):
        if not name.startswith(prefix):
            continue
        value = env[name]
        if any(marker in name.upper() for marker in SECRET_MARKERS):
            value = mask(value)
        lines.append(f"{name}={value}")
    return "\n".join(lines)


env = {"LLM_API_KEY": "sk-live-abcdef123456", "LLM_TIMEOUT": "30", "LLM_TOKEN": "short", "HOME": "/home/u"}
print(describe(env))
```

```text
LLM_API_KEY=sk-...3456
LLM_TIMEOUT=30
LLM_TOKEN=***
```

Короткие значения скрываются полностью: по трём первым и четырём последним символам их легко было бы восстановить. Длинный ключ показывается частично — так в логе видно, *какой* ключ используется (тестовый или боевой), но сам он не раскрыт.

## Попробуйте сами

1. Добавьте в `load_settings` проверку `max_concurrency`: целое число от 1 до 100.
2. Поддержите в `describe` переменные, имя которых содержит `PASS` (например, `DB_PASS`).
3. Создайте `.env` с двумя переменными и сравните `load_dotenv()` и `load_dotenv(override=True)`, если одна из них уже задана в окружении.

## Частые ошибки

- **Ключ в коде или в git.** Даже в «временном» скрипте. Если ключ попал в коммит — отзывайте его.
- **Забытый `.gitignore`.** `.env` создан, но не исключён — и улетает в репозиторий вместе с первым `git add .`.
- **`bool(os.environ["DEBUG"])`.** Любая непустая строка, включая `"false"` и `"0"`, даёт `True`.
- **Числа без преобразования.** `os.environ["TIMEOUT"] * 2` — это строка `"3030"`, а не 60.
- **Чтение окружения по всему коду.** Настройки разбросаны, ошибки обнаруживаются поздно. Соберите их в один объект при старте.
- **Печать настроек целиком.** `print(settings)` или логирование словаря с ключами раскрывает секреты. Маскируйте или используйте `SecretStr`.
- **`load_dotenv(override=True)` в продакшене.** Локальный `.env` может подменить настоящие переменные сервера.
- **Ожидание, что `os.environ[...] = ...` изменит окружение терминала.** Изменение действует только внутри процесса.

## Где это в AI-инженерии

- **Ключи провайдеров**: SDK OpenAI и Anthropic по умолчанию сами читают `OPENAI_API_KEY` и `ANTHROPIC_API_KEY` из окружения — передавать ключ в код не нужно.
- **Выбор модели и параметров без изменения кода**: `MODEL_NAME`, `TEMPERATURE`, `MAX_TOKENS` в переменных окружения позволяют переключить модель на сервере одним изменением конфигурации.
- **Лимиты**: значения семафора и rate limiter из урока 4 зависят от тарифа — их выносят в `MAX_CONCURRENCY` и `REQUESTS_PER_MINUTE`.
- **Docker и облака**: контейнеры и облачные платформы передают настройки и секреты именно через переменные окружения; хранилища секретов (Vault, AWS Secrets Manager) в итоге тоже кладут значения в окружение процесса.
- **FastAPI-сервисы** в следующих частях курса используют pydantic-settings — описанный здесь объект настроек.

## Итоги урока

- Конфигурация и секреты хранятся вне кода — в переменных окружения.
- `os.environ["X"]` — обязательная переменная (`KeyError`, если нет), `os.getenv("X", default)` — необязательная.
- Значения всегда строки: числа и флаги преобразуйте явно, `bool("false")` — `True`.
- `.env` + python-dotenv — для локальной разработки; `.env` в `.gitignore`, `.env.example` в репозитории.
- Настройки собирают в один проверенный объект при старте; pydantic-settings делает это декларативно, а `SecretStr` прячет секреты.
