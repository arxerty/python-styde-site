# requests и httpx: HTTP-клиенты в Python

## Зачем библиотека, если HTTP — это текст

В прошлом уроке мы разбирали HTTP «руками»: строку статуса, заголовки, JSON-тело. Писать это самому для каждого запроса — долго и опасно: нужно открыть TLS-соединение, правильно закодировать параметры, посчитать `Content-Length`, обработать перенаправления, сжатие, кодировки, повторно использовать соединения. Всё это делают **HTTP-клиенты**.

В Python два главных клиента:

- **requests** — классическая синхронная библиотека, «HTTP для людей». Есть почти в каждом проекте, огромное количество примеров в интернете;
- **httpx** — современная библиотека с почти таким же API, но умеет и синхронный, и **асинхронный** режим, поддерживает HTTP/2 и строгие таймауты по умолчанию. Именно на httpx построены официальные Python SDK OpenAI и Anthropic.

Ставятся обе через pip:

```bash
pip install requests httpx
```

В этом уроке мы сначала посмотрим на requests (его нужно уметь читать), а затем подробно — на httpx, потому что асинхронный код из уроков 2–4 требует асинхронного клиента.

## requests: первый запрос

```python norun
import requests

response = requests.get(
    "https://api.github.com/repos/python/cpython",
    params={"per_page": 5},
    headers={"Accept": "application/json"},
    timeout=10,
)
print(response.status_code)          # 200
print(response.headers["content-type"])
data = response.json()               # тело, разобранное из JSON
print(data["full_name"], data["stargazers_count"])
```

Главное, что нужно знать:

- метод библиотеки = HTTP-метод: `requests.get`, `post`, `put`, `delete`;
- `params=` — параметры строки запроса; requests сам их закодирует (вспомните `urlencode`);
- `headers=` — словарь заголовков;
- `json=` — тело запроса: словарь будет превращён в JSON, а заголовок `Content-Type: application/json` выставлен автоматически;
- `timeout=` — **обязательно**. По умолчанию requests ждёт бесконечно, и зависший сервер повесит вашу программу;
- `response.status_code`, `response.headers` (словарь без учёта регистра), `response.text` (строка), `response.content` (байты), `response.json()` (разобранный JSON).

POST-запрос к LLM API на requests выглядит так:

```python norun
import os
import requests

response = requests.post(
    "https://api.example.com/v1/chat",
    headers={"Authorization": f"Bearer {os.environ['API_KEY']}"},
    json={"model": "mini", "messages": [{"role": "user", "content": "Привет"}]},
    timeout=30,
)
response.raise_for_status()   # исключение, если статус 4xx или 5xx
print(response.json()["content"])
```

`raise_for_status()` превращает «плохой» статус в исключение `requests.HTTPError`. Без него код с ответом 500 спокойно пойдёт дальше и упадёт позже на `["content"]` с непонятной ошибкой `KeyError`.

Если запросов к одному серверу много, используют **сессию** `requests.Session()`: она переиспользует TCP-соединения (не нужно каждый раз заново устанавливать TLS) и хранит общие заголовки:

```python norun
with requests.Session() as session:
    session.headers["Authorization"] = f"Bearer {key}"
    for model in ["mini", "large"]:
        r = session.get(f"https://api.example.com/v1/models/{model}", timeout=10)
        print(model, r.status_code)
```

Ограничение requests одно, но принципиальное: он **только синхронный**. Вызов `requests.get` внутри `async def` блокирует цикл событий — ровно та ошибка из урока 1, из-за которой «асинхронный» код работает последовательно.

## httpx: тот же API плюс асинхронность

httpx намеренно повторяет интерфейс requests, поэтому переход почти бесплатный:

```python norun
import httpx

response = httpx.get("https://api.github.com/repos/python/cpython", timeout=10)
response.raise_for_status()
print(response.json()["full_name"])
```

Отличия, которые важно помнить:

- **таймаут по умолчанию есть** — 5 секунд; для LLM это мало, ответ модели может идти 30–60 секунд, поэтому таймаут задают явно;
- перенаправления (3xx) по умолчанию **не** выполняются автоматически — нужно `follow_redirects=True`;
- вместо сессии — **клиент** `httpx.Client`, а для асинхронного кода — `httpx.AsyncClient`.

Клиент хранит общие настройки: базовый URL, заголовки, таймауты. Все запросы через него идут по относительным путям:

```python norun
with httpx.Client(
    base_url="https://api.example.com/v1",
    headers={"Authorization": f"Bearer {key}"},
    timeout=httpx.Timeout(30.0, connect=5.0),
) as client:
    r = client.post("/chat", json={"model": "mini", "messages": messages})
    r.raise_for_status()
```

`httpx.Timeout(30.0, connect=5.0)` — 5 секунд на установку соединения и 30 на остальные этапы (чтение, запись). Подключение должно происходить быстро: если сервер не отвечает 5 секунд, он, скорее всего, недоступен, а вот генерация ответа может быть долгой.

## Запросы без сети: MockTransport

Как проверить код, который ходит в сеть, не обращаясь к сети? httpx позволяет подменить **транспорт** — слой, который физически отправляет запрос. `httpx.MockTransport(handler)` вызывает вашу функцию `handler(request)` и возвращает её ответ. Это идеальный инструмент для обучения и для тестов:

```python
import httpx


def handler(request):
    if request.url.path == "/v1/models":
        return httpx.Response(200, json={"data": ["mini", "large"]})
    return httpx.Response(404, json={"error": "not found"})


client = httpx.Client(base_url="https://api.example.com", transport=httpx.MockTransport(handler))
r = client.get("/v1/models")
print(r.status_code, r.json()["data"])
r = client.get("/v1/nothing")
print(r.status_code, r.json())
```

```text
200 ['mini', 'large']
404 {'error': 'not found'}
```

Клиент работает как настоящий: формирует URL из `base_url`, кодирует параметры и тело, разбирает JSON. Подменён только последний шаг — отправка. В обработчике доступен весь запрос:

```python
import json

import httpx


def echo(request):
    body = json.loads(request.content) if request.content else None
    return httpx.Response(200, json={
        "method": request.method,
        "query": dict(request.url.params),
        "auth": request.headers.get("authorization"),
        "body": body,
    })


client = httpx.Client(
    base_url="https://api.example.com",
    headers={"Authorization": "Bearer test-key"},
    transport=httpx.MockTransport(echo),
)
print(client.get("/search", params={"q": "векторы", "limit": 3}).json())
print(client.post("/chat", json={"prompt": "Привет"}).json()["body"])
```

```text
{'method': 'GET', 'query': {'q': 'векторы', 'limit': '3'}, 'auth': 'Bearer test-key', 'body': None}
{'prompt': 'Привет'}
```

Обратите внимание: параметр `limit` пришёл строкой `'3'` — в URL всё становится текстом. Заголовок `Authorization`, заданный один раз в клиенте, попадает в каждый запрос.

## Ошибки httpx

У httpx понятная иерархия исключений:

| Исключение | Когда возникает |
|---|---|
| `httpx.HTTPStatusError` | `raise_for_status()` при статусе 4xx/5xx; в `.response` — сам ответ |
| `httpx.TimeoutException` | превышен таймаут (подклассы `ConnectTimeout`, `ReadTimeout`, ...) |
| `httpx.ConnectError` | не удалось соединиться (нет сети, неверный хост) |
| `httpx.RequestError` | базовый класс всех ошибок отправки, включая таймауты и `ConnectError` |
| `httpx.HTTPError` | общий предок `RequestError` и `HTTPStatusError` |

Отличать их важно: таймаут и 5xx имеет смысл повторить, 401 — нет. Посмотрим, как это выглядит:

```python
import httpx


def handler(request):
    if request.url.path == "/slow":
        raise httpx.ReadTimeout("сервер молчит", request=request)
    return httpx.Response(429, headers={"Retry-After": "2"})


client = httpx.Client(base_url="https://api.example.com", transport=httpx.MockTransport(handler))

for path in ["/slow", "/busy"]:
    try:
        client.get(path).raise_for_status()
    except httpx.HTTPStatusError as error:
        print("статус", error.response.status_code, error.response.headers["retry-after"])
    except httpx.TimeoutException as error:
        print("таймаут:", type(error).__name__)
```

```text
таймаут: ReadTimeout
статус 429 2
```

Порядок `except` здесь не важен (классы не пересекаются), но если вы ловите и `httpx.RequestError`, и `httpx.TimeoutException`, более конкретный класс должен идти первым — как вы помните из блока 1.7.

## AsyncClient: асинхронные запросы

Асинхронный клиент устроен так же, только методы — корутины, а клиент открывают через `async with`:

```python
import asyncio

import httpx


async def handler(request):
    await asyncio.sleep(0.01)
    model = request.url.path.rsplit("/", 1)[-1]
    return httpx.Response(200, json={"id": model, "context": len(model) * 1000})


async def main():
    async with httpx.AsyncClient(
        base_url="https://api.example.com/v1", transport=httpx.MockTransport(handler)
    ) as client:
        responses = await asyncio.gather(*(client.get(f"/models/{m}") for m in ["mini", "large", "xl"]))
    return [r.json()["context"] for r in responses]


print(asyncio.run(main()))
```

```text
[4000, 5000, 2000]
```

Всё, что мы изучили в уроках 2–4, переносится напрямую: `gather` запускает запросы одновременно, `Semaphore` ограничивает одновременность, `wait_for` или таймаут клиента ограничивает время. Для асинхронного транспорта обработчик может быть и обычной, и `async` функцией.

Одно важное правило: **создавайте клиент один раз** и переиспользуйте его для многих запросов. Клиент держит пул соединений; создание нового клиента на каждый запрос заставляет заново устанавливать TCP и TLS и может исчерпать ресурсы. Типичный шаблон — клиент создаётся в `main` (или при старте веб-приложения) и передаётся в функции параметром.

## Внедрение клиента: код, который легко тестировать

Последний пример подсказывает важный архитектурный приём. Сравните две функции:

```python norun
def get_models_bad():
    r = httpx.get("https://api.example.com/v1/models", timeout=10)
    return r.json()["data"]


def get_models(client: httpx.Client) -> list[str]:
    r = client.get("/models")
    r.raise_for_status()
    return r.json()["data"]
```

Первая жёстко привязана к сети и настоящему серверу: протестировать её можно, только подменяя модуль httpx. Вторая получает клиент **параметром** — в программе ей передают настоящий клиент, а в тестах клиент с `MockTransport`. Этот приём называют **внедрением зависимостей** (dependency injection), и он встретится вам в блоке 2.8 про тесты и в части про FastAPI.

## Разбор задачи: клиент LLM с повторами

Напишем функцию `complete(client, prompt, retries=3)`, которая отправляет промпт в «LLM API», при 429 и 5xx повторяет запрос (с паузой из `Retry-After`, если он есть), а при других ошибках сразу бросает исключение. Сервер подменим обработчиком, который первые два раза отвечает ошибкой:

```python
import time

import httpx


def complete(client, prompt, retries=3, sleep=time.sleep):
    for attempt in range(retries + 1):
        response = client.post("/chat", json={"prompt": prompt})
        retryable = response.status_code == 429 or response.status_code >= 500
        if not retryable or attempt == retries:
            response.raise_for_status()
            return response.json()["text"]
        sleep(float(response.headers.get("retry-after", 2 ** attempt)))


calls = []


def flaky_server(request):
    calls.append(request.url.path)
    if len(calls) == 1:
        return httpx.Response(429, headers={"Retry-After": "0.5"})
    if len(calls) == 2:
        return httpx.Response(503)
    return httpx.Response(200, json={"text": "Готово!"})


pauses = []
client = httpx.Client(base_url="https://llm.local", transport=httpx.MockTransport(flaky_server))
print(complete(client, "Привет", sleep=pauses.append))
print(len(calls), pauses)
```

```text
Готово!
3 [0.5, 2.0]
```

Разберём решения:

- функция получает `client` параметром — её можно проверить без сети;
- `sleep` тоже параметр: в программе это `time.sleep`, а в примере — `pauses.append`, поэтому пример выполняется мгновенно, и мы видим, какие паузы были бы сделаны. Первая пауза взята из `Retry-After` (0.5), вторая — экспоненциальная `2 ** 1 = 2`;
- на последней попытке мы не повторяем, а вызываем `raise_for_status()`, чтобы ошибка дошла до вызывающего кода;
- ответ 401 или 400 не повторяется: `raise_for_status()` сработает сразу.

Именно так внутри устроены официальные SDK: у клиента OpenAI и Anthropic есть параметр `max_retries`, а повторяются как раз 408, 429 и 5xx.

## Попробуйте сами

1. Добавьте в `flaky_server` ответ `401` на третий вызов и убедитесь, что `complete` бросает `httpx.HTTPStatusError` сразу, без повторов.
2. Перепишите `complete` в асинхронную версию с `httpx.AsyncClient` и `asyncio.sleep`.
3. Сделайте так, чтобы `complete` повторяла и `httpx.TimeoutException`.

## Частые ошибки

- **Нет таймаута в requests.** `requests.get(url)` без `timeout=` может ждать вечно. Всегда указывайте таймаут явно, и в httpx тоже: значение по умолчанию (5 с) слишком мало для LLM.
- **requests внутри async-кода.** Синхронный вызов блокирует цикл событий — используйте `httpx.AsyncClient`.
- **Новый клиент на каждый запрос.** `httpx.get(...)` в цикле или `async with AsyncClient()` внутри функции, которую вызывают тысячу раз, — лишние соединения и медленная работа. Создайте клиент один раз.
- **Забытый `raise_for_status()`.** Код с ответом 500 продолжает работать и падает позже с непонятным `KeyError` или `JSONDecodeError`.
- **`response.json()` без проверки.** Сервер при ошибке может вернуть HTML-страницу, и `.json()` бросит исключение. Сначала проверьте статус.
- **Секреты в коде.** Ключ `"sk-..."` прямо в исходнике попадёт в git. Ключи читают из переменных окружения — об этом следующий урок.
- **Слишком широкий `except`.** `except Exception` вокруг запроса прячет ошибки в вашем же коде. Ловите `httpx.HTTPError` или конкретные подклассы.

## Где это в AI-инженерии

- **SDK провайдеров LLM** (`openai`, `anthropic`) построены на httpx: параметры `timeout`, `max_retries`, `http_client` в их конструкторах — это настройки httpx-клиента. Понимая httpx, вы понимаете, как настраивать SDK.
- **Сбор данных**: загрузка документов для RAG, обход публичных API, скачивание датасетов — `httpx.AsyncClient` с семафором и rate limiter из урока 4.
- **Вызовы инструментов агентом**: агент вызывает внешние API (погода, поиск, база знаний) — каждая такая функция-инструмент принимает клиент и имеет таймаут.
- **Тестирование**: `MockTransport` (и библиотека `respx`) позволяют проверить логику повторов, разбор ответов и обработку ошибок без реальных запросов и без расходов на токены.
- **Сервисы на FastAPI** используют `AsyncClient`, созданный при старте приложения, чтобы обращаться к моделям и другим микросервисам.

## Итоги урока

- requests — простой синхронный клиент: `get/post`, `params`, `json`, `headers`, обязательный `timeout`, `raise_for_status()`, `Session` для многих запросов.
- httpx — почти тот же API плюс `AsyncClient`, таймауты по умолчанию, `base_url`; на нём построены SDK LLM-провайдеров.
- Клиент создают один раз и передают в функции параметром — так код быстрее и тестируется без сети.
- `httpx.MockTransport` подменяет отправку запроса функцией-обработчиком.
- Ошибки: `HTTPStatusError` (плохой статус), `TimeoutException`, `RequestError`; повторяют 429, 5xx и таймауты.
