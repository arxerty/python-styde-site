# collections: Counter, defaultdict, deque, namedtuple; heapq

## Специализированные контейнеры

Список, словарь, множество и кортеж решают большинство задач. Но некоторые задачи встречаются так часто, что для них в стандартной библиотеке есть специализированные контейнеры — модуль `collections` — и модуль `heapq` для очередей с приоритетом. Они делают код короче и, что важно после прошлых уроков, **быстрее**: каждая структура оптимизирована под свою задачу.

## Counter: подсчёт

Подсчитать частоты — одна из самых частых задач в обработке текстов. Вы много раз писали `counts[word] = counts.get(word, 0) + 1`. `Counter` делает это одной строкой:

```python
from collections import Counter

text = "кот видит кота и кот спит а кота видит пёс"
counts = Counter(text.split())
print(counts["кот"], counts["кота"], counts["слон"])
print(counts.most_common(3))
print(sum(counts.values()), len(counts))
```

```text
2 2 0
[('кот', 2), ('видит', 2), ('кота', 2)]
10 7
```

- `Counter(iterable)` считает элементы; это подкласс `dict` с элементами в качестве ключей и количествами в качестве значений;
- обращение к отсутствующему ключу возвращает **0**, а не `KeyError`;
- `most_common(n)` — `n` самых частых пар (при равных количествах — в порядке первого появления).

Счётчики можно складывать, вычитать и обновлять — удобно для объединения статистики по частям корпуса:

```python
from collections import Counter

part1 = Counter({"ошибка": 3, "ок": 10})
part2 = Counter({"ошибка": 1, "таймаут": 2})
total = part1 + part2
print(total)
total.update(["ок", "ок"])
print(total["ок"], (total - part2)["таймаут"])
```

```text
Counter({'ок': 10, 'ошибка': 4, 'таймаут': 2})
12 0
```

При вычитании счётчики с нулевым или отрицательным результатом удаляются — поэтому `таймаут` пропал, а обращение к нему вернуло 0.

## defaultdict: словарь со значением по умолчанию

Группировка — ещё одна частая задача: «слово → список документов», «класс → список примеров». С обычным словарём приходится проверять наличие ключа или использовать `setdefault`. `defaultdict` создаёт значение для нового ключа автоматически — вызывая переданную **фабрику**:

```python
from collections import defaultdict

reviews = [("pos", "отлично"), ("neg", "ужасно"), ("pos", "супер"), ("neu", "нормально")]
by_label = defaultdict(list)
for label, text in reviews:
    by_label[label].append(text)
print(dict(by_label))

index = defaultdict(set)
docs = {"d1": "кот спит", "d2": "кот ест", "d3": "пёс спит"}
for doc_id, text in docs.items():
    for word in text.split():
        index[word].add(doc_id)
print(sorted(index["кот"]), sorted(index["спит"]))
```

```text
{'pos': ['отлично', 'супер'], 'neg': ['ужасно'], 'neu': ['нормально']}
['d1', 'd2'] ['d1', 'd3']
```

Фабрика — любая функция без аргументов: `list`, `set`, `int` (даёт 0 — простой счётчик), `dict`, `lambda: "?"`. Второй пример — **инвертированный индекс**: для каждого слова — множество документов, где оно встречается. Это основа классического полнотекстового поиска.

Тонкость: `defaultdict` создаёт ключ при **любом** обращении через `[]`, даже при чтении. Проверка `index["слон"]` добавит в словарь пустое множество. Для проверки наличия используйте `in` или `.get()`.

## deque: двусторонняя очередь

В уроке 3 выяснилось, что `list.pop(0)` и `insert(0, x)` — O(n). Для очередей предназначен `deque` (double-ended queue): добавление и удаление с **обоих концов** — O(1):

```python
from collections import deque

tasks = deque(["первый", "второй"])
tasks.append("третий")
tasks.appendleft("срочный")
print(tasks.popleft(), tasks.pop(), list(tasks))

recent = deque(maxlen=3)
for message in ["m1", "m2", "m3", "m4", "m5"]:
    recent.append(message)
print(list(recent))
```

```text
срочный третий ['первый', 'второй']
['m3', 'm4', 'm5']
```

- `append`/`appendleft`, `pop`/`popleft` — O(1);
- параметр `maxlen` превращает deque в **кольцевой буфер**: при переполнении самые старые элементы вытесняются автоматически. Идеально для «последних N сообщений диалога», «последних N значений loss», скользящих окон;
- доступ по индексу к середине — O(n): deque оптимизирован для концов, а не для произвольного доступа.

Скользящее среднее (блок 2.3) с `deque` становится очень простым:

```python
from collections import deque


def moving_average(values, window):
    buffer = deque(maxlen=window)
    total = 0.0
    for value in values:
        if len(buffer) == window:
            total -= buffer[0]
        buffer.append(value)
        total += value
        if len(buffer) == window:
            yield round(total / window, 2)


print(list(moving_average([1, 2, 3, 4, 5, 6], 3)))
```

```text
[2.0, 3.0, 4.0, 5.0]
```

## namedtuple: кортеж с именами полей

`namedtuple` создаёт класс кортежа, к элементам которого можно обращаться по именам. Это лёгкая неизменяемая «запись»:

```python
from collections import namedtuple

Hit = namedtuple("Hit", ["doc_id", "score", "text"])
hit = Hit("d42", 0.87, "Pydantic проверяет данные")
print(hit.score, hit[0])
doc_id, score, _ = hit
print(doc_id, score)
print(hit._replace(score=0.9))
print(hit._asdict())
```

```text
0.87 d42
d42 0.87
Hit(doc_id='d42', score=0.9, text='Pydantic проверяет данные')
{'doc_id': 'd42', 'score': 0.87, 'text': 'Pydantic проверяет данные'}
```

namedtuple — настоящий кортеж: неизменяемый, хешируемый (если поля хешируемы), распаковывается и сравнивается как кортеж, занимает мало памяти. Есть и типизированная версия — `typing.NamedTuple` с аннотациями полей:

```python
from typing import NamedTuple


class Point(NamedTuple):
    x: float
    y: float = 0.0


p = Point(3.0)
print(p, p.x + p.y, p == (3.0, 0.0))
```

```text
Point(x=3.0, y=0.0) 3.0 True
```

Когда что выбирать: namedtuple — для лёгких неизменяемых записей, особенно если их много или их нужно распаковывать как кортежи; dataclass (блок 2.2) — когда нужны изменяемость, методы, значения по умолчанию-фабрики; Pydantic — когда данные нужно проверять.

## heapq: очередь с приоритетом

**Куча** (heap) — структура данных, которая позволяет быстро получать **минимальный** элемент. Модуль `heapq` реализует кучу поверх обычного списка:

- `heapq.heappush(heap, x)` — добавить элемент: O(log n);
- `heapq.heappop(heap)` — извлечь минимальный: O(log n);
- `heap[0]` — посмотреть минимальный: O(1);
- `heapq.heapify(items)` — превратить список в кучу на месте: O(n).

```python
import heapq

queue = []
heapq.heappush(queue, (2, "обработать отзыв"))
heapq.heappush(queue, (1, "ответить клиенту VIP"))
heapq.heappush(queue, (3, "обновить индекс"))
print(queue[0])
while queue:
    priority, task = heapq.heappop(queue)
    print(priority, task)
```

```text
(1, 'ответить клиенту VIP')
1 ответить клиенту VIP
2 обработать отзыв
3 обновить индекс
```

Элементы-кортежи сравниваются поэлементно, поэтому первым элементом ставят приоритет. Куча — минимальная; для «максимальной» кучи приоритет берут со знаком минус. Если приоритеты могут совпасть, а вторые элементы несравнимы (например, словари), добавляют счётчик: `(priority, counter, item)` — так же, как в практикуме блока 2.5.

Почему не сортировать список при каждом добавлении? Сортировка — O(n log n) на каждую операцию, а куча — O(log n). Внутри куча — дерево, хранящееся в массиве: элемент с индексом `i` не больше своих «детей» с индексами `2i + 1` и `2i + 2`. Поэтому минимум всегда в начале, а добавление и удаление перестраивают только одну ветку высотой log n.

## Top-k: nlargest и nsmallest

Частая задача — найти `k` лучших из большого числа элементов: лучшие документы поиска, самые частые слова, самые уверенные предсказания. Сортировать всё — O(n log n); `heapq.nlargest` держит кучу из `k` элементов и работает за O(n log k):

```python
import heapq

scores = {"d1": 0.31, "d2": 0.92, "d3": 0.55, "d4": 0.88, "d5": 0.12, "d6": 0.79}
top3 = heapq.nlargest(3, scores.items(), key=lambda item: item[1])
print(top3)
print(heapq.nsmallest(2, [5, 1, 8, 3, 9]))
```

```text
[('d2', 0.92), ('d4', 0.88), ('d6', 0.79)]
[1, 3]
```

Правило: для `k = 1` используйте `max`/`min`, для небольшого `k` — `nlargest`/`nsmallest`, если нужен весь порядок — `sorted`.

## Разбор задачи: анализ логов чат-бота

Соберём инструменты урока в одной задаче: по журналу запросов к чат-боту посчитать самые частые интенты, сгруппировать время ответа по моделям, найти самые медленные запросы и хранить последние сообщения каждого пользователя.

```python
import heapq
from collections import Counter, defaultdict, deque, namedtuple

Request = namedtuple("Request", ["user", "intent", "model", "latency_ms"])

log = [
    Request("ada", "погода", "small", 120),
    Request("alan", "перевод", "large", 950),
    Request("ada", "перевод", "large", 870),
    Request("grace", "погода", "small", 95),
    Request("ada", "код", "large", 1400),
    Request("alan", "погода", "small", 110),
    Request("ada", "погода", "small", 130),
]

intents = Counter(r.intent for r in log)
latency_by_model = defaultdict(list)
history = defaultdict(lambda: deque(maxlen=2))
for request in log:
    latency_by_model[request.model].append(request.latency_ms)
    history[request.user].append(request.intent)

print(intents.most_common(2))
print({model: sum(v) // len(v) for model, v in latency_by_model.items()})
slowest = heapq.nlargest(2, log, key=lambda r: r.latency_ms)
print([(r.user, r.latency_ms) for r in slowest])
print(list(history["ada"]))
```

```text
[('погода', 4), ('перевод', 2)]
{'small': 113, 'large': 1073}
[('ada', 1400), ('alan', 950)]
['код', 'погода']
```

Каждая задача решена подходящим инструментом:

- `Counter` — частоты интентов и топ одной строкой;
- `defaultdict(list)` — группировка задержек без проверок ключей;
- `defaultdict(lambda: deque(maxlen=2))` — для каждого пользователя свой кольцевой буфер последних запросов (так хранят короткую память диалога);
- `heapq.nlargest` — самые медленные запросы без сортировки всего журнала;
- `namedtuple` — читаемые поля `r.latency_ms` вместо `r[3]`.

## Попробуйте сами

- Найдите с помощью `Counter` 5 самых частых символов в любом тексте, не считая пробелов.
- Постройте инвертированный индекс для пяти коротких документов и реализуйте поиск документов, содержащих **все** слова запроса (пересечение множеств).
- Реализуйте с `heapq` слияние трёх отсортированных списков (подсказка: в модуле есть `heapq.merge`).

## Частые ошибки

**1. Чтение из defaultdict создаёт ключ.** `if index["слон"]:` добавляет ключ «слон». Для проверки — `"слон" in index`.

**2. `deque` для произвольного доступа.** `d[len(d) // 2]` — O(n). deque хорош для концов, а не для середины.

**3. Максимальная куча через heapq.** heapq — минимальная куча; для максимума кладите `(-priority, ...)`.

**4. Несравнимые элементы в куче.** При равных приоритетах Python сравнивает вторые элементы кортежа; словари несравнимы → `TypeError`. Добавляйте счётчик: `(priority, next(counter), item)`.

**5. Сортировка ради top-k.** `sorted(items)[-k:]` для миллиона элементов и `k = 10` — лишняя работа; `heapq.nlargest(k, items)`.

**6. Изменение namedtuple.** `hit.score = 1.0` → `AttributeError`; используйте `hit._replace(score=1.0)`.

## Где это в AI-инженерии

- **Counter**: словари токенизаторов строятся по частотам (BPE начинает с подсчёта пар символов), статистика меток датасета, анализ ошибок модели.
- **defaultdict**: инвертированные индексы для поиска (BM25 в RAG-гибридах), группировка примеров по классам при балансировке датасета.
- **deque(maxlen=...)**: окно последних сообщений в памяти чат-бота, буфер последних значений метрик для ранней остановки, replay buffer в обучении с подкреплением.
- **heapq**: top-k документов в векторном поиске, beam search при генерации текста (держит k лучших гипотез), очереди задач с приоритетами.
- **namedtuple**: лёгкие записи результатов (`Hit`, `Prediction`), которых бывают миллионы.

## Итоги урока

- `Counter` — подсчёт частот, `most_common(n)`, сложение и вычитание счётчиков; отсутствующий ключ — 0.
- `defaultdict(factory)` — автоматическое значение для нового ключа; удобен для группировки и индексов.
- `deque` — O(1) с обоих концов; `maxlen` — кольцевой буфер последних N элементов.
- `namedtuple` / `typing.NamedTuple` — неизменяемые записи с именованными полями.
- `heapq` — минимальная куча: `heappush`/`heappop` за O(log n); `nlargest`/`nsmallest` — top-k за O(n log k).
