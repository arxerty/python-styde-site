# Шпаргалка: асинхронность и сеть

## Когда что использовать

| Задача | Инструмент |
|---|---|
| Много одновременных сетевых ожиданий | `asyncio` + `httpx.AsyncClient` |
| Несколько блокирующих вызовов, синхронная библиотека | `ThreadPoolExecutor` |
| Тяжёлые вычисления на Python | `ProcessPoolExecutor` |
| Один-два запроса в скрипте | синхронный `httpx` / `requests` |

- asyncio — один поток, задачи **чередуются** в точках `await`; вычисления не ускоряет.
- Любой блокирующий вызов (`time.sleep`, `requests.get`) внутри `async def` останавливает всех.

## Корутины

```python norun
import asyncio

async def ask(prompt: str) -> str:      # async def → корутинная функция
    await asyncio.sleep(0.1)            # await — точка, где можно переключиться
    return prompt.upper()

coro = ask("x")                         # корутина создана, но НЕ выполняется
result = asyncio.run(ask("x"))          # точка входа: запускает цикл событий
```

- `await` — только внутри `async def`; `asyncio.run` — один раз, снаружи.
- Забытый `await` → `RuntimeWarning: coroutine ... was never awaited`, а вместо результата — объект корутины.

## gather, задачи, таймауты

```python norun
results = await asyncio.gather(*(ask(p) for p in prompts))           # порядок как в аргументах
results = await asyncio.gather(*coros, return_exceptions=True)        # ошибки — в списке
task = asyncio.create_task(ask("x"))   # запустить сейчас, дождаться позже: await task
task.cancel()                          # отмена → CancelledError внутри задачи

try:
    answer = await asyncio.wait_for(ask("x"), timeout=5)   # отменит при превышении
except TimeoutError:                                        # 3.11+: встроенный TimeoutError
    ...

async with asyncio.timeout(5):          # 3.11+: таймаут на блок
    a = await ask("a")
    b = await ask("b")
```

- Последовательные `await` складываются по времени, `gather` — берёт максимум.
- Ссылку на задачу из `create_task` нужно хранить, иначе её может собрать сборщик мусора.

## Лимиты

```python norun
semaphore = asyncio.Semaphore(5)        # ОДИН на все задачи

async def guarded(prompt):
    async with semaphore:               # не больше 5 одновременно
        return await ask(prompt)

class RateLimiter:                      # не больше per_second стартов в секунду
    def __init__(self, per_second):
        self.interval, self._next = 1 / per_second, 0.0

    async def wait(self):
        now = time.monotonic()
        start = max(now, self._next)
        self._next = start + self.interval
        if start > now:
            await asyncio.sleep(start - now)
```

- Семафор — сколько **одновременно**, rate limiter — сколько **за интервал**; для LLM API нужны оба.
- Очередь и воркеры: `asyncio.Queue`, `await queue.get()`, `queue.task_done()`, `await queue.join()`.
- Оценка одновременности: `запросов/с × время_ответа` (закон Литтла).

## HTTP

| Часть | Пример |
|---|---|
| Метод | `GET` (читать), `POST` (создать/вычислить), `PUT`, `PATCH`, `DELETE` |
| URL | `https://api.site.com/v1/models?limit=10` |
| Заголовки | `Authorization: Bearer <ключ>`, `Content-Type: application/json` |
| Тело | JSON-строка |

| Статус | Значение | Повторять? |
|---|---|---|
| 200, 201, 204 | успех | — |
| 301, 302, 304 | перенаправление / не изменилось | — |
| 400, 401, 403, 404, 422 | ошибка запроса | **нет** |
| 408, 429 | таймаут / слишком много запросов | да, `Retry-After` |
| 500, 502, 503, 504 | ошибка сервера | да, с паузой |

- `urlencode(params)` кодирует параметры; ключи — в заголовке, не в URL.
- `Content-Length` — в **байтах**; кириллица в UTF-8 — 2 байта на символ.
- `POST` не идемпотентен: для безопасного повтора — `Idempotency-Key`.

## requests и httpx

```python norun
import httpx

with httpx.Client(base_url="https://api.x/v1",
                  headers={"Authorization": f"Bearer {key}"},
                  timeout=httpx.Timeout(30.0, connect=5.0)) as client:
    r = client.post("/chat", json={"prompt": "Привет"}, params={"v": 2})
    r.raise_for_status()              # 4xx/5xx → httpx.HTTPStatusError
    data = r.json()

async with httpx.AsyncClient(base_url=..., timeout=30) as client:
    r = await client.get("/models")

# requests — только синхронно; timeout обязателен (по умолчанию — вечно)
r = requests.get(url, params=..., headers=..., timeout=10)
```

- Ошибки httpx: `HTTPStatusError` (статус), `TimeoutException`, `ConnectError` ⊂ `RequestError` ⊂ `HTTPError`.
- Клиент создают **один раз** и передают в функции параметром.
- Тесты без сети: `httpx.MockTransport(handler)` — `handler(request) -> httpx.Response`.

## Окружение и .env

```python norun
import os
from dotenv import load_dotenv, dotenv_values

load_dotenv()                                  # .env → os.environ (не перезаписывает заданные)
key = os.environ["LLM_API_KEY"]                # обязательная: KeyError, если нет
timeout = float(os.getenv("LLM_TIMEOUT", "30")) # необязательная, явное преобразование
values = dotenv_values(".env")                 # словарь, os.environ не трогает
```

- Значения окружения — **строки**: `bool("false") is True`, `"3" * 2 == "33"`.
- `.env` → в `.gitignore`; `.env.example` (без секретов) → в репозиторий.
- Настройки собирают в один объект при старте и проверяют все сразу (или `pydantic_settings.BaseSettings`).
- Секреты в логах маскируют (`SecretStr`, `sk-...3456`); утёкший ключ — **отзывают**.
