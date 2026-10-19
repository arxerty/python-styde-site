# Модули, import и стандартная библиотека

## Не изобретать велосипед

В прошлых уроках вы уже писали `import json` и `import csv`, не задумываясь, что это значит. **Модуль** — это файл с Python-кодом (функциями, классами, константами), который можно подключить к своей программе. Python поставляется с огромной **стандартной библиотекой** — сотнями модулей «из коробки»: математика, случайные числа, даты, файлы, сеть, архивы, JSON, CSV. Говорят, что Python идёт «с батарейками в комплекте».

А сверх стандартной библиотеки есть сотни тысяч сторонних пакетов: NumPy, pandas, scikit-learn, PyTorch, transformers, SDK для LLM. Умение подключать и использовать чужой код — половина работы AI-инженера: никто не пишет умножение матриц или токенизатор с нуля.

## Способы импорта

```python
import math
print(math.sqrt(16), math.pi)

from math import sqrt, pi
print(sqrt(25), pi)

import datetime as dt
print(dt.date(2026, 10, 17))

from collections import Counter as Cnt
print(Cnt("абракадабра").most_common(1))
```

```text
4.0 3.141592653589793
5.0 3.141592653589793
2026-10-17
[('а', 5)]
```

| Запись | Что делает | Как обращаться |
|---|---|---|
| `import math` | подключает модуль целиком | `math.sqrt(...)` |
| `from math import sqrt` | берёт конкретные имена | `sqrt(...)` |
| `import numpy as np` | модуль под коротким именем | `np.array(...)` |
| `from x import y as z` | имя под другим именем | `z(...)` |

Какой способ выбрать:

- `import модуль` — по умолчанию: из `math.sqrt` сразу видно, откуда функция;
- `from модуль import имя` — когда имя используется часто и понятно само по себе (`from pathlib import Path`);
- `as` — для общепринятых сокращений: `import numpy as np`, `import pandas as pd`, `import matplotlib.pyplot as plt`. Их знает каждый — используйте именно их.

**Не используйте `from модуль import *`** (импортировать всё): в программу «высыпаются» десятки имён, которые могут затенить ваши собственные или встроенные (вспомните урок про LEGB), а читателю непонятно, откуда что взялось.

### Порядок импортов

По PEP 8 импорты пишут **в начале файла**, сгруппированными:

1. стандартная библиотека (`import json`, `import math`);
2. сторонние пакеты (`import numpy as np`);
3. модули вашего проекта (`from utils import clean_text`).

Группы отделяют пустой строкой. Инструменты вроде `ruff` (блок 2.8) расставляют порядок автоматически.

## Как работает import

Когда Python встречает `import math`, он:

1. ищет модуль в списке папок `sys.path`: папка запускаемого скрипта, стандартная библиотека, установленные пакеты (`site-packages`);
2. **выполняет** код модуля один раз и создаёт объект-модуль;
3. запоминает его в кэше `sys.modules` — повторный `import` в любом месте программы берёт готовый объект без повторного выполнения;
4. связывает имя `math` с этим объектом в текущей области видимости.

Пункт 2 объясняет, зачем в своих файлах нужен `if __name__ == "__main__":` (блок про функции): без него код запуска выполнится при каждом импорте модуля.

**Свои модули.** Любой `.py`-файл — модуль. Если рядом лежит `text_utils.py` с функцией `clean`, его можно подключить `from text_utils import clean`. Отсюда частая ловушка: **не называйте свои файлы как модули стандартной библиотеки или популярные пакеты**. Файл `random.py` или `json.py` в папке проекта «перекроет» настоящий модуль, и `import random` загрузит ваш файл — с загадочными ошибками вроде `module 'random' has no attribute 'randint'`.

## math: математика

```python
import math

print(math.sqrt(2), math.floor(3.7), math.ceil(3.2))
print(math.log(math.e), math.log10(1000), math.log2(8))
print(math.exp(1), math.isclose(0.1 + 0.2, 0.3))
print(math.factorial(5), math.gcd(48, 18), math.hypot(3, 4))
print(math.inf > 10**100, math.isnan(float("nan")))
```

```text
1.4142135623730951 3 4
1.0 3.0 3.0
2.718281828459045 True
120 6 5.0
True True
```

Особенно важны для ML:

- `math.exp` и `math.log` — основа сигмоиды, softmax и функций потерь (блоки 3.2–3.3);
- `math.isclose` — правильное сравнение float (помните `0.1 + 0.2`?);
- `math.inf` — «бесконечность», удобна как начальное значение для поиска минимума: `best_loss = math.inf`;
- `math.ceil` — округление вверх: сколько батчей нужно — `math.ceil(n / batch_size)`.

## random: случайные числа

```python
import random

random.seed(42)
print(random.random())
print(random.randint(1, 6))
print(random.choice(["кот", "пёс", "попугай"]))
items = [1, 2, 3, 4, 5]
random.shuffle(items)
print(items)
print(random.sample(range(100), 3))
```

```text
0.6394267984578837
1
попугай
[4, 5, 1, 2, 3]
[94, 13, 86]
```

- `random()` — дробное от 0 до 1; `randint(a, b)` — целое от a до b **включительно**;
- `choice(seq)` — случайный элемент; `sample(seq, k)` — k разных элементов;
- `shuffle(list)` — перемешивает список **на месте** (возвращает `None`).

### seed: воспроизводимость

Числа из `random` на самом деле **псевдослучайные**: их вычисляет детерминированный алгоритм из начального значения — **зерна** (seed). Одинаковое зерно — одинаковая последовательность. Именно поэтому вывод примера выше совпадёт у вас и у меня.

Для ML это критически важно: перемешивание данных, разбиение на train/test, начальные веса нейросети — всё случайное. Без фиксированного seed эксперимент нельзя воспроизвести, и непонятно, улучшилась ли модель от ваших изменений или от удачного случайного разбиения. Правило: **фиксируйте seed в каждом эксперименте** (в NumPy и PyTorch — свои функции, блоки 4.1 и 6.3).

Чтобы не влиять на глобальный генератор (им могут пользоваться другие части программы), создают отдельный объект: `rng = random.Random(42)`, и вызывают `rng.shuffle(...)`, `rng.random()`.

> Модуль `random` **не подходит для паролей и токенов**: его последовательность можно предсказать. Для безопасности — модуль `secrets` (`secrets.token_hex(16)`).

## datetime: даты и время

```python
from datetime import date, datetime, timedelta

release = date(2026, 10, 17)
print(release, release.year, release.weekday())
deadline = release + timedelta(days=30)
print(deadline, (deadline - release).days)
parsed = datetime.strptime("2026-10-17 14:30", "%Y-%m-%d %H:%M")
print(parsed.hour, parsed.strftime("%d.%m.%Y"))
print(date.fromisoformat("2026-12-31") > release)
```

```text
2026-10-17 2026 5
2026-11-16 30
14 17.10.2026
True
```

- `date` — дата, `datetime` — дата и время, `timedelta` — промежуток времени;
- арифметика: дата + промежуток = дата; дата − дата = промежуток (`.days`);
- `weekday()` — день недели (0 — понедельник, 6 — воскресенье; 17 октября 2026 — суббота, 5);
- `strptime` — разбор строки по шаблону, `strftime` — форматирование в строку (`%Y` год, `%m` месяц, `%d` день, `%H:%M` время);
- `fromisoformat` / `isoformat` — стандартный формат `ГГГГ-ММ-ДД`, лучший выбор для хранения дат в файлах и JSON.

Текущий момент — `datetime.now()`; для замеров времени выполнения используют `time.perf_counter()`.

## pathlib: пути к файлам

Модуль `pathlib` — современный способ работы с путями. Путь — объект `Path`, а не строка:

```python
from pathlib import Path

base = Path("project")
data_file = base / "data" / "train.csv"
print(data_file.as_posix())
print(data_file.name, data_file.stem, data_file.suffix)
print(data_file.parent.as_posix())
print(data_file.with_suffix(".json").as_posix())
```

```text
project/data/train.csv
train.csv train .csv
project/data
project/data/train.json
```

Оператор `/` склеивает части пути **правильно для любой ОС**: на Windows внутри будут обратные слэши `\`. Метод `as_posix()` превращает путь в строку с прямыми слэшами — мы используем его, чтобы вывод был одинаковым везде. Больше не нужно склеивать строки и путаться в слэшах.

`Path` умеет работать с файловой системой:

```python
from pathlib import Path

folder = Path("docs")
folder.mkdir(exist_ok=True)
(folder / "a.md").write_text("# Документ A", encoding="utf-8")
(folder / "b.txt").write_text("текст", encoding="utf-8")
(folder / "sub").mkdir(exist_ok=True)
(folder / "sub" / "c.md").write_text("# C", encoding="utf-8")

print(sorted(p.name for p in folder.iterdir()))
print(sorted(p.as_posix() for p in folder.rglob("*.md")))
print((folder / "a.md").read_text(encoding="utf-8"))
print((folder / "missing.md").exists())
```

```text
['a.md', 'b.txt', 'sub']
['docs/a.md', 'docs/sub/c.md']
# Документ A
False
```

- `mkdir(exist_ok=True)` — создать папку (не падать, если есть; `parents=True` — с промежуточными);
- `iterdir()` — содержимое папки; `glob("*.md")` — по шаблону; **`rglob("*.md")`** — рекурсивно во всех подпапках;
- `read_text` / `write_text` — прочитать/записать файл целиком одной строкой;
- `exists()`, `is_file()`, `is_dir()` — проверки.

`rglob` заменяет рекурсивный обход папок из урока про рекурсию одной строкой — именно так собирают документы для базы знаний.

## Другие полезные модули

| Модуль | Для чего |
|---|---|
| `collections` | `Counter`, `defaultdict`, `deque` — блок 2.6 |
| `itertools` | комбинации, группировки, цепочки итераторов — блок 2.3 |
| `functools` | `lru_cache`, `partial`, `reduce` — блок 2.4 |
| `statistics` | `mean`, `median`, `stdev` |
| `time` | паузы (`sleep`), замеры (`perf_counter`) |
| `os`, `sys` | переменные окружения, аргументы командной строки |
| `re` | регулярные выражения — поиск по шаблонам в тексте |
| `secrets` | безопасные случайные токены |
| `logging` | журналирование вместо print — блок 2.8 |

Прежде чем писать вспомогательную функцию, проверьте — возможно, она уже есть в стандартной библиотеке.

## Разбор задачи: воспроизводимое разбиение датасета

Разделим примеры на обучающую и тестовую выборки — так, чтобы при одном seed разбиение всегда было одинаковым:

```python
import math
import random


def train_test_split(items, test_ratio=0.2, seed=42):
    rng = random.Random(seed)
    shuffled = items[:]
    rng.shuffle(shuffled)
    test_size = math.ceil(len(shuffled) * test_ratio)
    return shuffled[test_size:], shuffled[:test_size]


data = list(range(10))
train, test = train_test_split(data)
print(train, test)
print(train_test_split(data) == (train, test))
print(sorted(train + test) == data)
```

```text
[2, 8, 5, 6, 9, 4, 0, 1] [7, 3]
True
True
```

Приёмы: копия `items[:]` — чтобы не перемешать исходный список (shuffle работает на месте); отдельный генератор `random.Random(seed)` — чтобы не трогать глобальный; `math.ceil` — чтобы тест не оказался пустым для маленьких данных. Проверки внизу подтверждают воспроизводимость и то, что ни один пример не потерян. В блоке 5.1 вы будете пользоваться готовой `train_test_split` из scikit-learn — с тем же параметром `random_state`.

## Попробуйте сами

- Посчитайте, сколько дней осталось до Нового года, используя `date.today()`.
- Сгенерируйте 5 случайных чисел с seed 1, затем ещё раз с seed 1 — совпадают ли они?
- Создайте через `pathlib` структуру папок `experiments/run_001/` и сохраните туда файл `config.json`.

## Частые ошибки

**1. Файл назван как модуль.** `random.py`, `json.py`, `csv.py`, `numpy.py` в папке проекта перекрывают настоящие модули.

**2. `from module import *`.** Засоряет пространство имён и прячет происхождение имён.

**3. Забыть seed.** Результаты экспериментов невозможно воспроизвести.

**4. `random.shuffle` с присваиванием.** `items = random.shuffle(items)` → `None`.

**5. Склеивать пути строками.** `"data" + "/" + name` ломается на разных ОС; используйте `Path` и `/`.

**6. `random` для секретов.** Предсказуем; для токенов и паролей — `secrets`.

## Где это в AI-инженерии

- **Импорт библиотек ML.** `import numpy as np`, `import pandas as pd`, `import torch`, `from transformers import AutoModel` — первые строки любого ML-скрипта.
- **Воспроизводимость.** `random.seed`, `np.random.seed`, `torch.manual_seed` — фиксируют случайность разбиения данных и инициализации моделей.
- **Сбор документов для RAG.** `Path("knowledge_base").rglob("*.md")` — найти все документы базы знаний.
- **Время и метки.** Временные метки в логах вызовов LLM, расчёт задержки ответа (`time.perf_counter()`), даты в метаданных документов для фильтрации («только документы за 2026 год»).
- **math в функциях потерь.** `math.log` и `math.exp` — основа cross-entropy и softmax, которые вы напишете с нуля в части 3.
- **Структура проекта.** Разбиение кода на свои модули (`data.py`, `model.py`, `train.py`) и импорт между ними — основа любого проекта крупнее одного файла (блок 2.8).

## Итоги урока

- Модуль — файл с кодом; `import m`, `from m import name`, `import m as alias`; без `import *`.
- `import` выполняет модуль один раз и кэширует его; не называйте свои файлы как библиотеки.
- `math` — математика (`sqrt`, `log`, `exp`, `ceil`, `isclose`, `inf`); `random` — псевдослучайность с `seed` для воспроизводимости.
- `datetime` — `date`, `datetime`, `timedelta`, `strptime`/`strftime`, `fromisoformat`.
- `pathlib.Path` — пути через `/`, `rglob`, `read_text`/`write_text`, `exists`.
