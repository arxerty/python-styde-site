# Шпаргалка: строки глубоко

## Индексы и срезы

```python norun
s = "Python"
s[0], s[-1]          # 'P', 'n'
s[1:4]               # 'yth'   stop не включается
s[:3], s[3:]         # 'Pyt', 'hon'
s[-3:], s[:-3]       # последние 3 / всё кроме последних 3
s[::2], s[::-1]      # 'Pto', 'nohtyP'
s[:100]              # срезы не падают за границами
```

- Индекс за границей → `IndexError`; у пустой строки нет индексов.
- Строки **неизменяемы**: `s[0] = "J"` → `TypeError`; создавайте новую: `"J" + s[1:]`.

## Методы (все возвращают новую строку!)

| Задача | Метод |
|---|---|
| Регистр | `upper()`, `lower()`, `title()`, `capitalize()` |
| Пробелы по краям | `strip()`, `lstrip()`, `rstrip()`, `strip("*!")` |
| Подстрока с края | `removeprefix("x")`, `removesuffix(".txt")` |
| Разбить | `split()`, `split(",")`, `split(": ", 1)`, `splitlines()` |
| Склеить | `", ".join(words)` |
| Заменить | `replace(old, new[, count])` |
| Найти | `find` / `rfind` → индекс или **−1**; `index` → `ValueError` |
| Посчитать | `count(sub)` |

- `split()` без аргументов режет по любым пробелам и выбрасывает пустые куски.
- Нормализация пробелов: `" ".join(s.split())`.

## f-строки

```python norun
f"{name}, {x * 2}, {s.upper()}"
f"{x:.2f}"      # 3.14          f"{n:,}"     # 1,234,567
f"{p:.1%}"      # 87.7%         f"{lr:.1e}"  # 3.0e-04
f"{d:+.3f}"     # +0.050        f"{7:03d}"   # 007
f"{s:<10}" f"{s:>10}" f"{s:^10}" f"{s:*^20}"
f"{x=}"         # x=42  — отладка
f"{{json}}"     # фигурные скобки как текст
```

Формат меняет отображение (строка), `round()` — значение.

## Проверки

```python norun
"ошибка" in text.lower()
url.startswith(("http://", "https://"))
name.lower().endswith(".pdf")
"123".isdigit()   # все символы — цифры ("-5", "3.14", "" → False)
isalpha() isalnum() isspace() isupper() islower()
any(c.isdigit() for c in s)   # есть ли хоть одна цифра
```

## Unicode и кодировки

```python norun
ord("A"), chr(1071)               # 65, 'Я'
data = text.encode("utf-8")       # str → bytes
data.decode("utf-8")              # bytes → str
data.decode("utf-8", errors="replace")
```

- UTF-8: латиница 1 байт, кириллица 2, иероглифы 3, эмодзи 4.
- `ё` (1105) стоит после `я` (1103).
- Кракозябры `РџСЂРёРІРµС‚` = UTF-8, прочитанный как CP1251.
- Невидимые: ` ` (неразрывный пробел), `​` (нулевой ширины), `﻿` (BOM).

## Конвейер NLP

```python norun
words = []
for token in text.lower().split():          # нормализация + токенизация
    word = token.strip(".,!?;:—-«»\"()")   # очистка краёв
    if word and f" {word} " not in stop_words:   # фильтр
        words.append(word)
```

Биграммы: `for i in range(len(words) - 1): words[i], words[i + 1]`.

## Частые ошибки

- `s.upper()` без присваивания.
- `find` вернул −1, а срез «сработал».
- `isdigit()` вместо «есть ли цифра».
- `"на" in stop_words` без границ находит подстроку.
- Забыли удвоить `{}` для JSON внутри f-строки.
