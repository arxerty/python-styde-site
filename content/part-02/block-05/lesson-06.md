# Pydantic для JSON: ответы API и structured output LLM

## JSON — язык общения сервисов

Почти все внешние данные в AI-инженерии приходят в формате JSON: ответы LLM API, результаты векторного поиска, вебхуки, конфигурации, строки датасетов в JSONL. В блоке 1.7 вы разбирали JSON модулем `json` и получали словари — с которыми потом приходилось обращаться осторожно: вдруг ключа нет, вдруг значение не того типа.

Pydantic делает два шага сразу: **разбирает** JSON и **проверяет** результат по модели. На выходе — объект с атрибутами и правильными типами, или подробная ошибка.

## model_validate_json и model_dump_json

```python
from pydantic import BaseModel


class Usage(BaseModel):
    input_tokens: int
    output_tokens: int


class Completion(BaseModel):
    id: str
    text: str
    usage: Usage


raw = '{"id": "msg_01", "text": "Привет!", "usage": {"input_tokens": 12, "output_tokens": 3}}'
completion = Completion.model_validate_json(raw)
print(completion.text, completion.usage.input_tokens + completion.usage.output_tokens)
print(completion.model_dump_json())
```

```text
Привет! 15
{"id":"msg_01","text":"Привет!","usage":{"input_tokens":12,"output_tokens":3}}
```

- `Model.model_validate_json(строка)` — разбор JSON-строки и проверка за один шаг (быстрее, чем `json.loads` + `model_validate`, потому что разбор написан на Rust внутри pydantic-core);
- `model.model_dump_json()` — обратно в компактную JSON-строку (`indent=2` — с отступами); кириллица выводится как есть.

Ошибки разбора и проверки приходят единым `ValidationError`:

```python
from pydantic import BaseModel, ValidationError


class Usage(BaseModel):
    input_tokens: int
    output_tokens: int


for raw in ['{"input_tokens": 5}', "не JSON", '{"input_tokens": "много", "output_tokens": 1}']:
    try:
        Usage.model_validate_json(raw)
    except ValidationError as error:
        print([(e["type"], e["loc"]) for e in error.errors()])
```

```text
[('missing', ('output_tokens',))]
[('json_invalid', ())]
[('int_parsing', ('input_tokens',))]
```

Битый JSON, отсутствующее поле и неверный тип — три разных кода ошибки, и программа может реагировать на каждый по-своему.

## Псевдонимы полей: чужие имена ключей

Внешние API не обязаны следовать PEP 8: ключи могут быть в стиле `camelCase` (`inputTokens`) или совпадать с зарезервированными словами Python. Параметр `alias` связывает имя поля в Python с именем ключа в JSON:

```python
from pydantic import BaseModel, Field


class SearchHit(BaseModel):
    doc_id: str = Field(alias="docId")
    score: float
    page_number: int = Field(alias="pageNumber")


hit = SearchHit.model_validate({"docId": "d42", "score": 0.87, "pageNumber": 3})
print(hit.doc_id, hit.page_number)
print(hit.model_dump())
print(hit.model_dump(by_alias=True))
```

```text
d42 3
{'doc_id': 'd42', 'score': 0.87, 'page_number': 3}
{'docId': 'd42', 'score': 0.87, 'pageNumber': 3}
```

Внутри программы — питоничные имена `doc_id`, `page_number`; на границе с API — те, которых требует API. `model_dump(by_alias=True)` выдаёт словарь в формате API, например для отправки запроса.

## Список моделей: TypeAdapter

Ответ API часто — не объект, а **массив** объектов. `BaseModel` описывает один объект, а для произвольного типа (например, `list[SearchHit]`) используют `TypeAdapter`:

```python
from pydantic import BaseModel, TypeAdapter


class Hit(BaseModel):
    doc_id: str
    score: float


hits_adapter = TypeAdapter(list[Hit])
raw = '[{"doc_id": "a", "score": 0.9}, {"doc_id": "b", "score": "0.75"}]'
hits = hits_adapter.validate_json(raw)
print([h.doc_id for h in hits], sum(h.score for h in hits))

numbers = TypeAdapter(list[int]).validate_python(["1", 2, "3"])
print(numbers)
```

```text
['a', 'b'] 1.65
[1, 2, 3]
```

`TypeAdapter` применяет те же правила проверки и преобразования к любому типу: спискам, словарям, объединениям, `Literal`. Это удобно и для проверки отдельных значений без объявления модели.

## JSON-схема

Каждая модель Pydantic умеет описать себя в формате **JSON Schema** — стандартном описании структуры JSON-документа. Это ключ к structured output: схему передают языковой модели, чтобы она отвечала в нужном формате.

```python
from typing import Literal

from pydantic import BaseModel, Field


class Review(BaseModel):
    sentiment: Literal["positive", "negative", "neutral"] = Field(description="Тональность отзыва")
    score: int = Field(ge=1, le=5, description="Оценка от 1 до 5")
    summary: str = Field(max_length=100)


schema = Review.model_json_schema()
print(schema["required"])
print(schema["properties"]["sentiment"]["enum"])
print(schema["properties"]["score"]["minimum"], schema["properties"]["score"]["maximum"])
print(schema["properties"]["score"]["description"])
```

```text
['sentiment', 'score', 'summary']
['positive', 'negative', 'neutral']
1 5
Оценка от 1 до 5
```

Аннотации, `Literal`, ограничения `Field` и описания `description` — всё попало в схему. Модель-описание данных в коде становится одновременно документацией для LLM.

## Structured output: ответ модели по схеме

Языковые модели генерируют текст. Если нужен **структурированный** результат — классификация, извлечение сущностей, разбор документа, — модель просят ответить JSON по схеме, а ответ проверяют Pydantic-моделью. Это называется **structured output** (структурированный вывод).

Типичный поток:

1. описать результат Pydantic-моделью;
2. передать модели JSON-схему (в промпте, через параметр инструмента или специальный параметр API — современные API гарантируют соответствие схеме);
3. проверить ответ через `model_validate_json`;
4. если проверка не прошла — повторить запрос, добавив в промпт текст ошибки, или обработать ошибку.

Модели нередко оборачивают JSON в markdown-блок или добавляют фразу перед ним. Напишем извлечение JSON из ответа и разбор с проверкой:

```python
import re

from pydantic import BaseModel, Field, ValidationError


class Entities(BaseModel):
    people: list[str]
    cities: list[str]
    year: int | None = Field(default=None, ge=1000, le=2100)


def extract_json(text: str) -> str:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    return text[start:end + 1] if start != -1 and end > start else text


def parse_answer(text: str) -> Entities | str:
    try:
        return Entities.model_validate_json(extract_json(text))
    except ValidationError as error:
        problems = "; ".join(f"{'.'.join(map(str, e['loc'])) or 'json'}: {e['type']}" for e in error.errors())
        return f"ошибка формата: {problems}"


answers = [
    'Вот результат:\n```json\n{"people": ["Ада Лавлейс"], "cities": ["Лондон"], "year": 1843}\n```',
    '{"people": ["Тьюринг"], "cities": [], "year": "тысяча"}',
    "Извините, я не могу ответить.",
]
for answer in answers:
    print(parse_answer(answer))
```

```text
people=['Ада Лавлейс'] cities=['Лондон'] year=1843
ошибка формата: year: int_parsing
ошибка формата: json: json_invalid
```

Что происходит:

- первый ответ — JSON внутри markdown-блока с поясняющей фразой: `extract_json` достаёт объект, проверка проходит;
- во втором модель вернула строку вместо числа в `year` — проверка ловит это и сообщает, **какое** поле неверно;
- в третьем JSON нет вовсе — `json_invalid`.

Сообщение об ошибке формата в виде «`year: int_parsing`» удобно отправить модели при повторном запросе: «Твой ответ не прошёл проверку: year должен быть числом. Исправь». Так устроены библиотеки structured output вроде instructor: модель Pydantic + проверка + автоматический повтор с текстом ошибок.

## Литералы для классификации

Особенно мощно сочетание structured output и `Literal`: модель-классификатор не может «придумать» новую метку — ответ с меткой вне списка не пройдёт проверку:

```python
from typing import Literal

from pydantic import BaseModel, Field, ValidationError


class Ticket(BaseModel):
    category: Literal["billing", "bug", "feature", "other"]
    urgency: int = Field(ge=1, le=3)
    reason: str = Field(min_length=3)


def classify(raw_answer: str) -> Ticket | None:
    try:
        return Ticket.model_validate_json(raw_answer)
    except ValidationError:
        return None


print(classify('{"category": "bug", "urgency": 3, "reason": "падает оплата"}'))
print(classify('{"category": "complaint", "urgency": 2, "reason": "грубый ответ"}'))
```

```text
category='bug' urgency=3 reason='падает оплата'
None
```

Метка `"complaint"` не входит в допустимые — ответ отвергнут, и код, который дальше маршрутизирует тикеты по категориям, никогда не получит неожиданное значение.

## Разбор задачи: клиент поиска с проверкой ответов

Соберём всё: ответ API поиска с ключами в стиле camelCase, вложенными результатами и метаданными; проверка, преобразование в удобный вид и экспорт для следующего шага пайплайна RAG.

```python
from pydantic import BaseModel, Field, ValidationError


class Hit(BaseModel):
    doc_id: str = Field(alias="docId")
    score: float = Field(ge=0, le=1)
    text: str


class SearchResponse(BaseModel):
    query: str
    took_ms: int = Field(alias="tookMs", ge=0)
    hits: list[Hit]

    def top(self, threshold: float) -> list[Hit]:
        return sorted((h for h in self.hits if h.score >= threshold), key=lambda h: h.score, reverse=True)


raw = """
{"query": "что такое pydantic", "tookMs": 18,
 "hits": [
   {"docId": "d1", "score": 0.42, "text": "Pydantic — библиотека валидации"},
   {"docId": "d2", "score": 0.91, "text": "Модели Pydantic проверяют данные"},
   {"docId": "d3", "score": 0.77, "text": "FastAPI использует Pydantic"}
 ]}
"""
response = SearchResponse.model_validate_json(raw)
context = "\n".join(f"[{h.doc_id}] {h.text}" for h in response.top(threshold=0.5))
print(context)
print(response.took_ms, len(response.hits))

try:
    SearchResponse.model_validate_json('{"query": "x", "tookMs": 5, "hits": [{"docId": "d1", "score": 1.7, "text": "?"}]}')
except ValidationError as error:
    print(error.errors()[0]["loc"], error.errors()[0]["type"])
```

```text
[d2] Модели Pydantic проверяют данные
[d3] FastAPI использует Pydantic
18 3
('hits', 0, 'score') less_than_equal
```

Разберём решение:

- псевдонимы `docId` и `tookMs` изолируют стиль API: если провайдер переименует ключ, правка будет в одном месте — в модели;
- ограничение `score` от 0 до 1 ловит некорректный ответ сервиса (`1.7`) сразу на входе, а не где-то в середине пайплайна, где странная оценка испортила бы ранжирование;
- метод `top` живёт в модели рядом с данными: отфильтровать и отсортировать результаты — забота ответа поиска, а не каждого места, где он используется;
- дальше по коду ходит проверенный объект `SearchResponse` с атрибутами и подсказками редактора, а не словарь неизвестной формы.

## Попробуйте сами

- Добавьте в `Completion` поле `stop_reason: Literal["end_turn", "max_tokens"]` и разберите ответ с неизвестной причиной остановки.
- Напишите `TypeAdapter(dict[str, list[float]])` и проверьте им словарь эмбеддингов с одним «битым» вектором.
- Выведите `Ticket.model_json_schema()` целиком и найдите в нём допустимые категории.

## Частые ошибки

**1. `json.loads` + ручные проверки вместо модели.** Ручной код проверок длинный и всегда что-то упускает. Опишите модель и используйте `model_validate_json`.

**2. Доверие к ответу LLM без проверки.** Модель может вернуть лишний текст, пропустить поле или придумать новую метку. Всегда проверяйте ответ схемой и обрабатывайте `ValidationError`.

**3. Забытый `by_alias=True`.** `model_dump()` выдаёт имена полей Python; для отправки в API с другими именами ключей нужен `by_alias=True`.

**4. Жадное регулярное выражение.** Поиск JSON через `\{.*\}` без учёта markdown-блоков и вложенности может захватить лишнее. Сначала ищите блок в ```` ```json ````, затем — от первой `{` до последней `}`.

**5. Сравнение `str(error)` в коде.** Текст ошибки меняется между версиями. Для логики используйте `type` и `loc` из `error.errors()`.

**6. Огромные схемы для LLM.** Чем сложнее схема, тем чаще модель ошибается. Делайте модели для structured output простыми: плоские поля, `Literal` вместо свободного текста, понятные `description`.

## Где это в AI-инженерии

- **Structured output в API**: OpenAI и Anthropic позволяют передать JSON-схему ответа или описать инструмент схемой — модель генерирует JSON, который вы проверяете Pydantic. Библиотеки instructor, PydanticAI и LangChain строят это на Pydantic-моделях.
- **Извлечение данных из документов**: счета, резюме, договоры — «разбор документа в модель» с проверкой каждого поля.
- **Классификация и маршрутизация**: `Literal`-метки гарантируют, что LLM-классификатор вернёт только допустимые категории.
- **Клиенты API**: ответы поисковых и векторных баз, платёжных и внутренних сервисов описываются моделями с псевдонимами.
- **Вызовы инструментов агентами**: аргументы инструмента, сгенерированные моделью, проверяются схемой до выполнения — неверные аргументы возвращаются модели как ошибка.

## Итоги урока

- `Model.model_validate_json(s)` — разбор и проверка JSON за один шаг; `model_dump_json()` — обратно в JSON.
- Ошибки JSON и данных приходят единым `ValidationError` с кодами (`json_invalid`, `missing`, `int_parsing`...).
- `Field(alias="camelName")` — чужие имена ключей; `model_dump(by_alias=True)` — вывод в формате API.
- `TypeAdapter(list[Model])` — проверка произвольных типов, например JSON-массивов.
- `model_json_schema()` — JSON-схема модели для structured output; `description` и `Literal` попадают в схему.
- Structured output: схема → ответ модели → извлечение JSON → проверка → при ошибке повтор с текстом ошибок.
