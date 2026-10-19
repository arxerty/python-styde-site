# asyncio: корутины, async/await, цикл событий

## Корутина: функция, которая умеет ждать

Функция, объявленная через `async def`, — **корутинная функция** (coroutine function). Её поведение напоминает генераторы из блока 2.3: вызов **не выполняет** тело, а возвращает объект-**корутину**:

```python
import asyncio


async def greet(name):
    print("начало greet")
    return f"Привет, {name}!"


coroutine = greet("Ада")
print(type(coroutine).__name__)
result = asyncio.run(coroutine)
print(result)
```

```text
coroutine
начало greet
Привет, Ада!
```

Строка «начало greet» напечаталась только при `asyncio.run(...)`, а не при вызове `greet("Ада")`. Корутина — это «отложенное вычисление», которое кто-то должен запустить. Запускают её двумя способами:

- `asyncio.run(coroutine)` — точка входа из обычного (синхронного) кода: создаёт цикл событий, выполняет корутину до конца, закрывает цикл и возвращает результат. Обычно вызывается **один раз** в программе;
- `await coroutine` — внутри другой корутины: выполнить и дождаться результата.

Если создать корутину и забыть её запустить, Python выдаст предупреждение `RuntimeWarning: coroutine '...' was never awaited` — признак частой ошибки.

## await: дождаться результата

`await` можно писать только внутри `async def`. Он означает: «запусти эту операцию и, пока она не завершится, отдай управление циклу событий — пусть поработают другие задачи»:

```python
import asyncio


async def get_embedding(text):
    await asyncio.sleep(0.01)
    return [len(text), text.count(" ")]


async def similarity(a, b):
    vec_a = await get_embedding(a)
    vec_b = await get_embedding(b)
    return sum(x * y for x, y in zip(vec_a, vec_b))


print(asyncio.run(similarity("кот спит", "пёс бежит")))
```

```text
73
```

`await` работает с **awaitable**-объектами: корутинами, задачами (`Task`) и фьючерсами (`Future`). `asyncio.sleep(seconds)` — асинхронная пауза: в отличие от `time.sleep`, она уступает управление.

Важно: два `await` подряд выполняются **последовательно** — второй эмбеддинг начинает вычисляться только после первого. Одновременность появляется, только когда несколько задач запущены вместе (`gather`, `create_task` — следующий урок). В этом примере последовательность оправдана, если шаги зависят друг от друга; здесь они независимы, и их можно было бы запустить одновременно.

## Цикл событий

Как одна программа в одном потоке выполняет много задач? Её сердце — **цикл событий** (event loop). Упрощённо это бесконечный цикл с очередью:

1. взять из очереди готовую к выполнению задачу;
2. выполнять её, пока она не дойдёт до `await` на чём-то ещё не готовом (ответ сети, таймер);
3. запомнить, чего задача ждёт, и вернуться к пункту 1;
4. когда ожидаемое событие наступает (пришёл ответ, истёк таймер), вернуть задачу в очередь готовых.

Посмотрим на чередование задач. `asyncio.sleep(0)` — «уступить управление, не дожидаясь ничего»:

```python
import asyncio


async def worker(name, steps):
    for step in range(steps):
        print(f"{name}: шаг {step}")
        await asyncio.sleep(0)
    return name


async def main():
    return await asyncio.gather(worker("A", 3), worker("B", 2))


print(asyncio.run(main()))
```

```text
A: шаг 0
B: шаг 0
A: шаг 1
B: шаг 1
A: шаг 2
['A', 'B']
```

Задачи A и B чередуются: каждая выполняет шаг, на `await` уступает управление, и цикл событий запускает другую. Без `await` внутри цикла задача A выполнила бы все шаги, не давая B ни шанса.

Это **кооперативная многозадачность**: задачи сами решают, когда уступить (в точках `await`). В отличие от потоков, никто не прервёт задачу посреди вычисления — это делает асинхронный код предсказуемым, но и обязывает не держать управление долго.

## Корутины вызывают корутины

Асинхронный код «заразен»: если функция вызывает корутину и ждёт её результата, она сама должна быть асинхронной. Цепочка `async`-функций тянется от `asyncio.run` до самой нижней операции ввода-вывода:

```python
import asyncio


async def fetch_document(doc_id):
    await asyncio.sleep(0.01)
    return f"текст документа {doc_id}"


async def summarize(doc_id):
    text = await fetch_document(doc_id)
    return text.upper()


async def main():
    first = await summarize(1)
    second = await summarize(2)
    return [first, second]


print(asyncio.run(main()))
```

```text
['ТЕКСТ ДОКУМЕНТА 1', 'ТЕКСТ ДОКУМЕНТА 2']
```

Обычная (синхронная) функция не может написать `await` — это синтаксическая ошибка. Зато асинхронная функция может вызывать обычные функции: `text.upper()` выше — обычный вызов. Обычные функции внутри корутин должны быть быстрыми — иначе они заблокируют цикл.

## Асинхронные генераторы и async for

Корутина возвращает один результат. А как получать поток значений с ожиданием между ними — например, токены ответа модели по мере генерации? Для этого есть **асинхронные генераторы**: `async def` с `yield` внутри. Перебирают их через `async for`:

```python
import asyncio


async def stream_tokens(answer):
    for token in answer.split():
        await asyncio.sleep(0.01)
        yield token


async def main():
    received = []
    async for token in stream_tokens("Асинхронность экономит время ожидания"):
        received.append(token)
        print(f"получен токен {len(received)}: {token}")
    return " ".join(received)


print(asyncio.run(main()))
```

```text
получен токен 1: Асинхронность
получен токен 2: экономит
получен токен 3: время
получен токен 4: ожидания
Асинхронность экономит время ожидания
```

Именно так выглядит стриминг ответа в асинхронных SDK для LLM: `async for chunk in stream: ...`. Пока очередной токен не пришёл, цикл событий может обслуживать другие запросы — например, других пользователей чат-бота.

## Асинхронные контекстные менеджеры: async with

Контекстные менеджеры из блока 2.4 тоже бывают асинхронными: вход и выход могут требовать ожидания — открыть соединение, закрыть сессию. Их методы — `__aenter__` и `__aexit__`, а используются они через `async with`. С `contextlib.asynccontextmanager` такой менеджер пишется генератором:

```python
import asyncio
from contextlib import asynccontextmanager


@asynccontextmanager
async def connection(name):
    await asyncio.sleep(0.01)
    print(f"соединение с {name} открыто")
    try:
        yield {"name": name, "queries": 0}
    finally:
        await asyncio.sleep(0.01)
        print(f"соединение с {name} закрыто")


async def main():
    async with connection("векторная база") as conn:
        conn["queries"] += 1
        print("запрос выполнен")
    return conn["queries"]


print(asyncio.run(main()))
```

```text
соединение с векторная база открыто
запрос выполнен
соединение с векторная база закрыто
1
```

В уроке 6 вы будете писать `async with httpx.AsyncClient() as client:` — асинхронный HTTP-клиент, который открывает и закрывает пул соединений.

## asyncio в Jupyter и на этом сайте

В Jupyter-ноутбуках цикл событий уже запущен, поэтому там `asyncio.run` выдаст ошибку, а вместо него пишут `await main()` прямо в ячейке (top-level await). В обычных скриптах — `asyncio.run(main())`, как в этом уроке. На этом сайте код выполняется в браузере, и `asyncio.run` работает так же, как в обычном Python.

## Разбор задачи: асинхронный пайплайн ответа

Соберём урок вместе: корутина получает контекст из «базы знаний», затем стримит ответ модели токенами, ведя журнал событий. Этапы зависят друг от друга, поэтому идут последовательно через `await`.

```python
import asyncio

KNOWLEDGE = {
    "rag": "RAG дополняет промпт найденными документами",
    "агент": "агент вызывает инструменты в цикле",
}


async def retrieve(question):
    await asyncio.sleep(0.01)
    hits = [text for key, text in KNOWLEDGE.items() if key in question.lower()]
    return hits


async def generate(question, context):
    answer = context[0] if context else "не знаю"
    for word in answer.split():
        await asyncio.sleep(0)
        yield word


async def answer(question, log):
    context = await retrieve(question)
    log.append(f"найдено документов: {len(context)}")
    words = []
    async for word in generate(question, context):
        words.append(word)
    log.append(f"токенов: {len(words)}")
    return " ".join(words)


async def main():
    log = []
    result = await answer("Что такое RAG?", log)
    unknown = await answer("Как испечь хлеб?", log)
    return result, unknown, log


result, unknown, log = asyncio.run(main())
print(result)
print(unknown)
print(log)
```

```text
RAG дополняет промпт найденными документами
не знаю
['найдено документов: 1', 'токенов: 5', 'найдено документов: 0', 'токенов: 2']
```

Обратите внимание на устройство:

- `retrieve` — обычная корутина: один результат после ожидания;
- `generate` — асинхронный генератор: поток токенов с ожиданием между ними;
- `answer` комбинирует их: `await` для одного значения, `async for` для потока;
- `main` — единственная точка, куда входит `asyncio.run`.

Два вопроса здесь обрабатываются по очереди; как обработать их одновременно — в следующем уроке.

## Попробуйте сами

- Вызовите `greet("Ада")` без `asyncio.run` и `await` и прочитайте предупреждение.
- Уберите `await asyncio.sleep(0)` из `worker` и посмотрите, как изменится порядок вывода.
- Напишите асинхронный генератор `countdown(n)`, который выдаёт числа от `n` до 1 с паузой `0.01` с, и соберите их в список через `async for`.

## Частые ошибки

**1. Вызов корутины без await.** `result = fetch()` внутри `async def` — `result` будет объектом корутины, а не данными; плюс предупреждение «never awaited».

**2. `await` в обычной функции.** `SyntaxError: 'await' outside async function`. Функция, которая ждёт, должна быть `async def`.

**3. `asyncio.run` внутри корутины или в Jupyter.** `RuntimeError: asyncio.run() cannot be called from a running event loop`. Внутри корутин — `await`, в ноутбуке — top-level `await`.

**4. Последовательные await там, где можно параллельно.** Независимые операции через `await a(); await b()` идут друг за другом. Для одновременности — `gather` (урок 3).

**5. Долгие вычисления без await.** Цикл на миллион итераций в корутине блокирует все задачи. Тяжёлые вычисления выносите в процессы (`loop.run_in_executor`) или разбивайте на части с `await asyncio.sleep(0)`.

**6. `for` вместо `async for` для асинхронного генератора.** `TypeError: 'async_generator' object is not iterable`.

## Где это в AI-инженерии

- **Асинхронные SDK для LLM**: `AsyncOpenAI`, `AsyncAnthropic` — методы клиента — корутины: `response = await client.messages.create(...)`.
- **Стриминг**: `async for event in stream:` — токены приходят по мере генерации и сразу отправляются пользователю.
- **FastAPI** (часть 8): обработчики запросов — `async def`; пока один запрос ждёт модель, сервер обслуживает другие.
- **Агентные фреймворки** строят цикл агента на корутинах: вызов модели, вызов инструментов, снова модель.
- **Асинхронные клиенты баз данных** и векторных хранилищ используют `async with` для соединений и транзакций.

## Итоги урока

- `async def` объявляет корутинную функцию; её вызов возвращает корутину, а не результат.
- Запуск: `asyncio.run(main())` из синхронного кода (один раз), `await coro` — внутри корутин.
- `await` ждёт awaitable-объект и уступает управление циклу событий; два `await` подряд — последовательно.
- Цикл событий переключает задачи в точках `await` — кооперативная многозадачность.
- Асинхронные генераторы (`async def` + `yield`) перебираются через `async for`; асинхронные контекстные менеджеры — через `async with`.
