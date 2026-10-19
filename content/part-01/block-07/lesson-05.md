# CSV и модуль csv

## Таблицы в текстовом файле

**CSV** (Comma-Separated Values — значения, разделённые запятыми) — самый распространённый формат табличных данных. Выгрузки из Excel и Google Таблиц, экспорт из баз данных, классические датасеты для машинного обучения (Titanic, Iris, цены на жильё) — всё это CSV. Файл выглядит так:

```text
name,age,city
Ада,36,Лондон
Алан,41,Манчестер
Грейс,85,Нью-Йорк
```

Первая строка — **заголовок** с названиями столбцов, дальше — по строке на запись, значения разделены запятыми.

## Почему не просто split(",")

Кажется, что CSV легко разобрать вручную: прочитать строку и разрезать по запятой. Но формат хитрее:

```text
name,comment
Ада,"Отлично, рекомендую"
Алан,"Сказал: ""Супер"""
```

Если значение само содержит запятую, его берут в **двойные кавычки**. Если внутри значения есть кавычка — её **удваивают**. Значение в кавычках может содержать даже перевод строки. `line.split(",")` разрежет `"Отлично, рекомендую"` на два куска и сломает таблицу. Поэтому для CSV используют модуль **`csv`** из стандартной библиотеки — он знает все эти правила.

## csv.reader: строки как списки

```python
import csv

with open("people.csv", "w", encoding="utf-8") as file:
    file.write('name,age,comment\nАда,36,"Отлично, рекомендую"\nАлан,41,"Сказал: ""Супер"""\n')

with open("people.csv", encoding="utf-8", newline="") as file:
    reader = csv.reader(file)
    header = next(reader)
    print("Заголовок:", header)
    for row in reader:
        print(row)
```

```text
Заголовок: ['name', 'age', 'comment']
['Ада', '36', 'Отлично, рекомендую']
['Алан', '41', 'Сказал: "Супер"']
```

- `csv.reader(file)` выдаёт каждую строку файла как **список строк**;
- `next(reader)` забирает первую строку — заголовок (функция `next` берёт следующий элемент из итератора);
- запятая и кавычки внутри значений обработаны правильно.

Важно: **все значения — строки**. `'36'` — не число! Преобразовывать типы нужно самим: `int(row[1])`.

Параметр `newline=""` в `open` рекомендует документация модуля `csv`: модуль сам разбирается с переводами строк (в том числе внутри значений в кавычках), а `open` не должен ему мешать.

## csv.DictReader: строки как словари

Обращаться к столбцам по номеру (`row[2]`) неудобно и хрупко: добавят столбец в начало — и все индексы съедут. **`DictReader`** использует заголовок как ключи и выдаёт каждую строку **словарём**:

```python
import csv

with open("scores.csv", "w", encoding="utf-8") as file:
    file.write("name,math,physics\nАда,5,4\nАлан,4,5\nГрейс,5,5\n")

with open("scores.csv", encoding="utf-8", newline="") as file:
    for row in csv.DictReader(file):
        total = int(row["math"]) + int(row["physics"])
        print(f"{row['name']}: {total}")
```

```text
Ада: 9
Алан: 9
Грейс: 10
```

`DictReader` — удобный выбор почти всегда: код читается по смыслу (`row["math"]`), а порядок столбцов в файле не важен.

## Запись: csv.writer и csv.DictWriter

Запись так же лучше доверить модулю — он сам поставит кавычки, где нужно:

```python
import csv

rows = [
    ["Ада", 36, "Отлично, рекомендую"],
    ["Алан", 41, 'Сказал: "Супер"'],
]
with open("out.csv", "w", encoding="utf-8", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(["name", "age", "comment"])
    writer.writerows(rows)

with open("out.csv", encoding="utf-8") as file:
    print(file.read())
```

```text
name,age,comment
Ада,36,"Отлично, рекомендую"
Алан,41,"Сказал: ""Супер"""
```

- `writerow(список)` — одна строка; `writerows(список_списков)` — много строк;
- числа превращаются в строки автоматически;
- кавычки расставлены только там, где они нужны.

`DictWriter` пишет словари, используя заданный список столбцов:

```python
import csv

results = [
    {"model": "small", "accuracy": 0.81, "latency_ms": 12},
    {"model": "large", "accuracy": 0.93, "latency_ms": 85},
]
with open("results.csv", "w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=["model", "accuracy", "latency_ms"])
    writer.writeheader()
    writer.writerows(results)

with open("results.csv", encoding="utf-8") as file:
    print(file.read())
```

```text
model,accuracy,latency_ms
small,0.81,12
large,0.93,85
```

`fieldnames` задаёт порядок столбцов, `writeheader()` пишет заголовок. Если в словаре окажется ключ, которого нет в `fieldnames`, будет `ValueError` (можно разрешить параметром `extrasaction="ignore"`).

## Другие разделители

Не все «CSV» разделены запятыми. В русскоязычном Excel часто используется **точка с запятой** (потому что запятая — десятичный разделитель), в научных данных — **табуляция** (формат TSV). Разделитель задаётся параметром `delimiter`:

```python
import csv

with open("ru.csv", "w", encoding="utf-8") as file:
    file.write("товар;цена\nКофе;199,90\nЧай;89,50\n")

with open("ru.csv", encoding="utf-8", newline="") as file:
    for row in csv.DictReader(file, delimiter=";"):
        price = float(row["цена"].replace(",", "."))
        print(row["товар"], price)
```

```text
Кофе 199.9
Чай 89.5
```

Обратите внимание на двойную проблему «русского» CSV: разделитель столбцов `;` и десятичная запятая в числах — обе нужно учитывать. Ещё один подвох Excel — кодировка: он часто сохраняет CSV в `cp1251` или в UTF-8 с BOM (`encoding="utf-8-sig"` прочитает такой файл без лишнего символа в первом заголовке).

## Типы и пропуски

В CSV нет типов — только текст. Пустое значение — пустая строка. Поэтому чтение CSV почти всегда сопровождается **приведением типов и обработкой пропусков**:

```python
import csv

with open("raw.csv", "w", encoding="utf-8") as file:
    file.write("name,age,salary\nАда,36,5000\nАлан,,4200\nГрейс,85,нет данных\n")

clean = []
problems = []
with open("raw.csv", encoding="utf-8", newline="") as file:
    for line_number, row in enumerate(csv.DictReader(file), start=2):
        try:
            age = int(row["age"]) if row["age"] else None
            salary = float(row["salary"])
        except ValueError:
            problems.append(line_number)
            continue
        clean.append({"name": row["name"], "age": age, "salary": salary})
print(clean)
print("Проблемные строки:", problems)
```

```text
[{'name': 'Ада', 'age': 36, 'salary': 5000.0}, {'name': 'Алан', 'age': None, 'salary': 4200.0}]
Проблемные строки: [4]
```

Пустой возраст превратился в `None` (пропуск), а нечисловая зарплата — в запись о проблеме с номером строки файла (`start=2`: строка 1 — заголовок). В блоке 4.2 эту работу возьмёт на себя pandas (`pd.read_csv`), но понимание того, что происходит внутри, поможет разобраться в его параметрах и ошибках.

## Разбор задачи: статистика по группам

Классическая задача анализа: средняя оценка по каждому городу из CSV-файла.

```python
import csv

with open("students.csv", "w", encoding="utf-8") as file:
    file.write("name,city,score\nАда,Лондон,95\nАлан,Манчестер,88\nТим,Лондон,81\nГрейс,Нью-Йорк,91\n")

totals = {}
counts = {}
with open("students.csv", encoding="utf-8", newline="") as file:
    for row in csv.DictReader(file):
        city = row["city"]
        totals[city] = totals.get(city, 0) + int(row["score"])
        counts[city] = counts.get(city, 0) + 1

with open("by_city.csv", "w", encoding="utf-8", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(["city", "students", "average"])
    for city in sorted(totals):
        writer.writerow([city, counts[city], round(totals[city] / counts[city], 1)])

with open("by_city.csv", encoding="utf-8") as file:
    print(file.read())
```

```text
city,students,average
Лондон,2,88.0
Манчестер,1,88.0
Нью-Йорк,1,91.0
```

Это та самая операция `groupby` + `mean`, которую в pandas делают одной строкой. Сейчас вы понимаете её устройство: потоковое чтение, два словаря-накопителя, запись результата.

## Попробуйте сами

- Прочитайте CSV с разделителем-табуляцией (`delimiter="\t"`).
- Запишите через `csv.writer` значение, содержащее перевод строки, и посмотрите, как оно оформлено в файле.
- Добавьте в разбор «статистики по группам» столбец с максимальной оценкой.

## Частые ошибки

**1. `split(",")` вместо модуля csv.** Ломается на запятых и кавычках внутри значений.

**2. Забыть, что значения — строки.** `row["age"] > 30` → `TypeError`; сначала `int()`.

**3. Не учесть заголовок.** С `csv.reader` первая строка — тоже «данные»; пропустите её `next(reader)` или используйте `DictReader`.

**4. Неверный разделитель.** Весь файл читается в один столбец — проверьте `delimiter`.

**5. Кодировка Excel.** `cp1251` или BOM в начале (`﻿name` в первом заголовке). Используйте правильную `encoding`, для BOM — `"utf-8-sig"`.

**6. Пропуски.** Пустая строка не превращается в число: обрабатывайте `""` явно.

## Где это в AI-инженерии

- **Классические датасеты.** Titanic, Iris, цены на жильё — CSV; с них начинается часть 4 и 5.
- **pandas.** `pd.read_csv` — обёртка над теми же идеями: разделитель, кодировка, типы, пропуски. Его параметры (`sep`, `encoding`, `na_values`, `dtype`) становятся понятны после этого урока.
- **Разметка данных.** Результаты ручной разметки часто приходят таблицей из Google Таблиц в CSV — с русскими разделителями и пустыми ячейками.
- **Наборы для эвалов.** Таблица «вопрос, эталонный ответ, категория» в CSV — простой способ собрать golden dataset (блок 7.7).
- **Отчёты экспериментов.** Метрики разных запусков удобно складывать в CSV и открывать в Excel или pandas для сравнения.

## Итоги урока

- CSV — таблица в тексте; значения с запятыми — в кавычках, кавычки удваиваются. Не парсите CSV через `split`.
- `csv.reader` → списки, `csv.DictReader` → словари по заголовку; все значения — строки.
- `csv.writer` (`writerow`, `writerows`) и `csv.DictWriter` (`fieldnames`, `writeheader`) — запись с правильными кавычками.
- `open(..., encoding="utf-8", newline="")`; `delimiter=";"` для «русского» CSV, `"\t"` для TSV.
- Типы и пропуски обрабатывайте явно; проблемные строки — учитывайте, а не теряйте молча.
