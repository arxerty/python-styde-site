# Шпаргалка: ошибки, файлы, модули

## Исключения

```python norun
try:
    value = int(text)              # только рискованный код
except ValueError as error:        # конкретное исключение
    print("не число:", error)
except (KeyError, IndexError):     # несколько типов
    ...
else:
    ...                            # если ошибок не было
finally:
    ...                            # всегда
```

- Срабатывает первый подходящий `except`; конкретные — раньше общих.
- Не используйте голый `except:` и `except: pass`.
- Иерархия: `Exception` → `ValueError`, `TypeError`, `LookupError` (`KeyError`, `IndexError`), `OSError` (`FileNotFoundError`, `PermissionError`).

## raise и свои исключения

```python norun
if not 0 <= t <= 2:
    raise ValueError(f"temperature от 0 до 2, получено {t}")

class LLMError(Exception):
    """Базовая ошибка."""

class RateLimitError(LLMError):
    """Слишком много запросов."""

except KeyError as error:
    raise ConfigError("нет параметра") from error   # сохранить причину
except ValueError:
    log(...)
    raise                                          # пробросить дальше
```

`assert` — только для внутренних проверок и тестов, не для данных.

## Файлы

```python norun
with open(path, "r", encoding="utf-8") as f:   # "w" стирает, "a" дописывает, "x" только новый
    for line in f:                             # потоково
        line = line.rstrip("\n")
with open(path, "w", encoding="utf-8") as f:
    f.write("строка\n")                        # \n сами
    print("строка", file=f)
```

## JSON

```python norun
import json
text = json.dumps(data, ensure_ascii=False, indent=2)   # объект → строка
data = json.loads(text)                                 # строка → объект
json.dump(data, f, ensure_ascii=False); json.load(f)    # файлы
try: json.loads(raw)
except json.JSONDecodeError: ...
```

`true/false/null` ↔ `True/False/None`; кортеж → список; ключи → строки. JSONL: по `json.dumps(obj)` на строку.

## CSV

```python norun
import csv
with open(p, encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f, delimiter=";"):   # словари, всё — строки
        age = int(row["age"])
with open(p, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=[...]); w.writeheader(); w.writerows(rows)
```

## Модули

```python norun
import math; from pathlib import Path; import numpy as np
math.sqrt, math.log, math.exp, math.ceil, math.isclose, math.inf
rng = random.Random(42); rng.shuffle(items); rng.randint(1, 6)
date.fromisoformat("2026-10-17"); date + timedelta(days=7); (d2 - d1).days
Path("data") / "train.csv"; p.suffix; p.stem; p.rglob("*.md"); p.read_text(encoding="utf-8")
```

Не называйте свои файлы `random.py`, `json.py`, `csv.py`.

## pip и venv (в терминале)

```bash
python -m venv .venv
```

```bash
.venv\Scripts\activate
```

```bash
python -m pip install -r requirements.txt
```

```bash
python -m pip freeze > requirements.txt
```

`==` точная версия, `>=` минимум, `~=` совместимая. Версии сравнивайте как кортежи чисел. `.venv/` — в `.gitignore`.

## Частые ошибки

- Слишком большой `try`; общий `except` раньше конкретного.
- Нет `encoding="utf-8"`; `"w"` вместо `"a"`.
- `split(",")` для CSV; числа из CSV — строки.
- `JSONDecodeError` не обработан; структура ответа не проверена.
- Забыли seed; пакеты в глобальный Python.
