# JSON — формат всех AI API

## Язык, на котором говорят сервисы

Когда ваша программа отправляет запрос в API языковой модели, она передаёт по сети текст в формате **JSON**. Ответ модели приходит тоже в JSON. Конфигурации, датасеты для fine-tuning, логи экспериментов, описания инструментов агентов, structured output — всё это JSON. Если бы у AI-инженерии был родной язык обмена данными, это был бы он.

В уроке про вложенные структуры вы уже видели, что JSON соответствует словарям и спискам Python. Теперь научимся полноценно работать с ним: превращать структуры в текст и обратно, читать и писать JSON-файлы, обрабатывать ошибки и работать с форматом JSONL.

## Формат JSON

JSON (JavaScript Object Notation) — текстовый формат, в котором есть шесть видов значений:

| JSON | Python | Пример JSON |
|---|---|---|
| объект | `dict` | `{"name": "Ада", "age": 36}` |
| массив | `list` | `[1, 2, 3]` |
| строка | `str` | `"текст"` |
| число | `int` / `float` | `42`, `3.14`, `1e-3` |
| `true` / `false` | `True` / `False` | `true` |
| `null` | `None` | `null` |

Строгие правила, которые часто нарушают:

- строки и ключи — **только в двойных кавычках**: `'текст'` — невалидный JSON;
- ключи объектов — **только строки** (`{1: "a"}` недопустимо);
- **нет** завершающих запятых: `[1, 2, ]` — ошибка;
- **нет** комментариев;
- логические значения и `null` — строчными буквами.

Именно поэтому JSON нельзя «собирать руками» склейкой строк — легко ошибиться. Для этого есть модуль `json`.

## json.dumps и json.loads: структура ↔ строка

Модуль `json` входит в стандартную библиотеку — его нужно только импортировать (подробно об `import` — в уроке 6):

```python
import json

data = {"model": "mini", "temperature": 0.7, "stream": False, "stop": None, "tags": ["ai", "тест"]}
text = json.dumps(data)
print(text)
print(type(text))
back = json.loads(text)
print(back == data, type(back))
```

```text
{"model": "mini", "temperature": 0.7, "stream": false, "stop": null, "tags": ["ai", "\u0442\u0435\u0441\u0442"]}
<class 'str'>
True <class 'dict'>
```

- `json.dumps(obj)` (**dump s**tring) — Python-объект → JSON-строка;
- `json.loads(text)` (**load s**tring) — JSON-строка → Python-объект.

Обратите внимание: `False` стал `false`, `None` — `null`, а кириллица превратилась в коды `т...`. Это корректный JSON, но нечитаемый. Параметры `dumps` управляют видом:

```python
import json

data = {"name": "Ада", "skills": ["python", "ml"], "age": 36}
print(json.dumps(data, ensure_ascii=False))
print(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True))
```

```text
{"name": "Ада", "skills": ["python", "ml"], "age": 36}
{
  "age": 36,
  "name": "Ада",
  "skills": [
    "python",
    "ml"
  ]
}
```

- `ensure_ascii=False` — сохранять кириллицу и другие символы как есть;
- `indent=2` — красивый многострочный вывод с отступами (для файлов, которые читают люди);
- `sort_keys=True` — ключи по алфавиту (удобно сравнивать файлы).

Для передачи по сети отступы не нужны (меньше байт), для конфигов и отчётов — нужны.

## json.dump и json.load: работа с файлами

Без буквы `s` функции работают с **файлами**:

```python
import json

config = {"model": "mini", "max_tokens": 256, "system": "Отвечай кратко"}
with open("config.json", "w", encoding="utf-8") as file:
    json.dump(config, file, ensure_ascii=False, indent=2)

with open("config.json", encoding="utf-8") as file:
    loaded = json.load(file)
print(loaded["system"], loaded["max_tokens"] + 1)
```

```text
Отвечай кратко 257
```

Правило запоминания: `dump`/`load` — файл, `dumps`/`loads` — строка (s = string).

## Что нельзя сохранить в JSON

JSON понимает только шесть видов значений. Множества, кортежи, даты, объекты своих классов — нет:

```python
import json

print(json.dumps({"point": (1, 2)}))
try:
    json.dumps({"tags": {"ai", "ml"}})
except TypeError as error:
    print("Ошибка:", error)
```

```text
{"point": [1, 2]}
Ошибка: Object of type set is not JSON serializable
```

Кортеж молча превратился в список (и при загрузке вернётся списком!), а множество вызвало `TypeError`. Решения:

- заранее преобразовать: `sorted(tags)`, `date.isoformat()`;
- параметр `default` — функция для «неизвестных» объектов: `json.dumps(data, default=str)` превратит их в строки.

## Ошибки разбора: JSONDecodeError

Если строка — не валидный JSON, `json.loads` бросает `json.JSONDecodeError` (наследник `ValueError`) с указанием места ошибки:

```python
import json

for text in ['{"ok": true}', "{'ok': True}", '{"a": 1,}', ""]:
    try:
        print("OK:", json.loads(text))
    except json.JSONDecodeError as error:
        print("Ошибка:", error.msg, "| позиция", error.pos)
```

```text
OK: {'ok': True}
Ошибка: Expecting property name enclosed in double quotes | позиция 1
Ошибка: Expecting property name enclosed in double quotes | позиция 8
Ошибка: Expecting value | позиция 0
```

Одинарные кавычки, лишняя запятая, пустая строка — всё это невалидный JSON. Такие ошибки — ежедневная реальность при работе с LLM: модель, которую попросили «ответь в JSON», иногда добавляет лишний текст, разметку или запятую.

## Разбор ответа языковой модели

Соберём надёжную функцию разбора JSON-ответа модели — с очисткой разметки из блока про строки и обработкой ошибок:

```python
import json


def parse_model_json(response):
    text = response.strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return None
        return None


print(parse_model_json('```json\n{"sentiment": "positive"}\n```'))
print(parse_model_json('Конечно! Вот ответ: {"sentiment": "negative"} Надеюсь, помог.'))
print(parse_model_json("Не могу ответить"))
```

```text
{'sentiment': 'positive'}
{'sentiment': 'negative'}
None
```

Две линии обороны: сначала убираем разметку и пробуем разобрать всё; если не вышло — ищем первый `{` и последнюю `}` и пробуем разобрать «вырезанный» объект. Если и это не помогло — `None`, и вызывающий код может, например, повторить запрос, сообщив модели об ошибке. Ещё надёжнее — **structured output**: режим API, при котором модель гарантированно возвращает JSON по заданной схеме (блок 7.3).

### Проверка структуры

Даже валидный JSON может иметь не ту структуру: нет нужного ключа, строка вместо числа. После разбора структуру проверяют:

```python
import json


def parse_rating(text):
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("ожидался JSON-объект")
    score = data.get("score")
    if not isinstance(score, int) or not 1 <= score <= 10:
        raise ValueError(f"score должен быть целым от 1 до 10, получено {score!r}")
    return score


print(parse_rating('{"score": 7, "reason": "хорошо"}'))
try:
    parse_rating('{"score": "семь"}')
except ValueError as error:
    print(error)
```

```text
7
score должен быть целым от 1 до 10, получено 'семь'
```

В блоке 2.5 такую проверку возьмёт на себя Pydantic: вы опишете ожидаемую структуру классом, и библиотека проверит всё автоматически.

## JSONL: по объекту на строку

Для больших наборов записей используют формат **JSONL** (JSON Lines): каждая строка файла — отдельный JSON-объект.

```python
import json

records = [{"prompt": "2+2?", "answer": "4"}, {"prompt": "Столица Франции?", "answer": "Париж"}]
with open("dataset.jsonl", "w", encoding="utf-8") as file:
    for record in records:
        file.write(json.dumps(record, ensure_ascii=False) + "\n")

with open("dataset.jsonl", encoding="utf-8") as file:
    for line in file:
        item = json.loads(line)
        print(item["prompt"], "→", item["answer"])
```

```text
2+2? → 4
Столица Франции? → Париж
```

Преимущества JSONL перед одним большим JSON-массивом:

- файл читается **потоково**, по строке — не нужно загружать гигабайты в память;
- новые записи можно **дописывать** режимом `"a"`, не переписывая файл;
- одна повреждённая строка не ломает весь файл — её можно пропустить.

Поэтому JSONL — стандарт для датасетов fine-tuning (OpenAI, Anthropic, Hugging Face), наборов для эвалов и логов LLM-приложений.

## Попробуйте сами

- Сохраните словарь с кириллицей с `ensure_ascii=True` и `False` и сравните размеры файлов.
- Проверьте, что получится после `json.loads(json.dumps({1: "a", (1, 2): "b"}))` — что произойдёт с ключами?
- Добавьте в `parse_model_json` обработку ответа-массива `[...]`.

## Частые ошибки

**1. Собирать JSON склейкой строк.** Кавычки, экранирование, запятые — используйте `json.dumps`.

**2. Путать `dump`/`dumps` и `load`/`loads`.** Без `s` — файл, с `s` — строка.

**3. Забыть `ensure_ascii=False`.** Кириллица превращается в `\uXXXX` — корректно, но нечитаемо.

**4. Не обрабатывать `JSONDecodeError`.** Ответ модели или файл от другого сервиса может быть невалидным.

**5. Верить структуре без проверки.** Валидный JSON с неожиданными ключами и типами — частая причина `KeyError` и `TypeError` дальше по коду.

**6. Ожидать, что кортежи и множества сохранятся.** Кортеж станет списком, множество вызовет `TypeError`, ключи-числа станут строками.

## Где это в AI-инженерии

- **Запросы и ответы API.** SDK превращают ваши параметры в JSON и разбирают JSON-ответ; при отладке полезно видеть сырой JSON (`print(json.dumps(payload, indent=2, ensure_ascii=False))`).
- **Structured output.** Извлечение сущностей, классификация, анкеты — модель возвращает JSON, который разбирают и валидируют.
- **Инструменты агентов.** Модель присылает аргументы вызова инструмента как JSON-строку: `json.loads(tool_call.arguments)` — первое, что делает код агента.
- **Датасеты fine-tuning.** JSONL с полями `messages` или `prompt`/`completion` — стандартный формат.
- **Логи и трассировка.** Каждый вызов модели записывается JSON-строкой (модель, промпт, ответ, токены, время, стоимость) — по таким логам строят метрики (блок 8.3).
- **Конфигурации экспериментов.** Параметры запуска в JSON-файле: эксперимент можно воспроизвести, просто сохранив конфиг рядом с результатами.

## Итоги урока

- JSON: объекты, массивы, строки (двойные кавычки), числа, `true`/`false`, `null`; без комментариев и завершающих запятых.
- `json.dumps`/`json.loads` — строка; `json.dump`/`json.load` — файл.
- `ensure_ascii=False` — читаемая кириллица, `indent=2` — красивый вывод, `default=str` — для несериализуемых объектов.
- Невалидный JSON → `json.JSONDecodeError`; после разбора проверяйте структуру.
- JSONL — по объекту на строку: потоковое чтение, дозапись, устойчивость к битым строкам.
