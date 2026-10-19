# asyncio.gather, create_task, таймауты

## От последовательности к одновременности

В прошлом уроке два `await` подряд выполнялись последовательно. Чтобы независимые операции шли **одновременно**, их нужно запустить вместе и только потом ждать. Для этого в asyncio есть три основных инструмента:

- `asyncio.gather(*aws)` — запустить несколько корутин и дождаться всех;
- `asyncio.create_task(coro)` — запустить корутину «в фоне» и получить объект-задачу;
- `asyncio.TaskGroup` — группа задач с аккуратной обработкой ошибок (Python 3.11+).

А чтобы ожидание не длилось вечно — таймауты: `asyncio.wait_for` и `asyncio.timeout`.

## gather: дождаться всех

```python
import asyncio
import time


async def call_model(name, latency):
    await asyncio.sleep(latency)
    return f"{name}: готово за {latency} с"


async def main():
    start = time.perf_counter()
    results = await asyncio.gather(
        call_model("small", 0.1),
        call_model("medium", 0.3),
        call_model("large", 0.2),
    )
    return results, round(time.perf_counter() - start, 1)


results, elapsed = asyncio.run(main())
print(results)
print(elapsed)
```

```text
['small: готово за 0.1 с', 'medium: готово за 0.3 с', 'large: готово за 0.2 с']
0.3
```

- все три корутины выполняются одновременно — общее время равно самой долгой (0.3 с), а не сумме (0.6 с);
- результаты возвращаются **в порядке аргументов**, а не в порядке завершения.

Часто корутины создаются из списка — тогда их распаковывают звёздочкой: `await asyncio.gather(*(fetch(url) for url in urls))`.

## Ошибки в gather

Что, если одна из корутин бросила исключение? По умолчанию `gather` пробрасывает **первое** исключение наружу, а результаты успешных задач теряются (остальные задачи при этом продолжают работать в фоне). Для пакетной обработки, где отдельные сбои допустимы, есть параметр `return_exceptions=True`: исключения возвращаются как обычные значения в списке результатов:

```python
import asyncio


async def classify(text):
    await asyncio.sleep(0.01)
    if not text.strip():
        raise ValueError("пустой текст")
    return "positive" if "хорош" in text else "negative"


async def main():
    texts = ["хороший фильм", "   ", "скучно"]
    try:
        await asyncio.gather(*(classify(t) for t in texts))
    except ValueError as error:
        print("gather прерван:", error)
    results = await asyncio.gather(*(classify(t) for t in texts), return_exceptions=True)
    for text, result in zip(texts, results):
        if isinstance(result, Exception):
            print(f"{text!r}: ошибка — {result}")
        else:
            print(f"{text!r}: {result}")


asyncio.run(main())
```

```text
gather прерван: пустой текст
'хороший фильм': positive
'   ': ошибка — пустой текст
'скучно': negative
```

С `return_exceptions=True` одна неудача не теряет остальные результаты: при обработке тысячи промптов десяток сбоев не должен уничтожать 990 готовых ответов. Проверка `isinstance(result, Exception)` отделяет ошибки от данных.

## create_task: запустить и продолжить

`asyncio.create_task(coro)` **сразу** ставит корутину в расписание цикла событий и возвращает объект `Task`. Пока задача выполняется в фоне, код может делать что-то ещё, а результат получить позже через `await task`:

```python
import asyncio


async def fetch_context(question):
    await asyncio.sleep(0.2)
    return f"контекст для «{question}»"


async def prepare_prompt():
    await asyncio.sleep(0.1)
    return "Ты — помощник по документации."


async def main():
    context_task = asyncio.create_task(fetch_context("что такое Task?"))
    system = await prepare_prompt()
    print("системный промпт готов, контекст готов:", context_task.done())
    context = await context_task
    print("контекст готов:", context_task.done())
    return f"{system}\n{context}"


print(asyncio.run(main()))
```

```text
системный промпт готов, контекст готов: False
контекст готов: True
Ты — помощник по документации.
контекст для «что такое Task?»
```

Поиск контекста (0.2 с) и подготовка промпта (0.1 с) шли одновременно, и вся функция заняла 0.2 с вместо 0.3. Разница между корутиной и задачей:

- **корутина** — «рецепт»: ничего не делает, пока её не начнут ждать;
- **задача** — уже запущенная корутина: работает в фоне, даже если её ещё никто не ждёт.

У задачи есть методы: `done()` — завершилась ли, `result()` — результат (если завершилась), `cancel()` — отменить. Сохраняйте ссылку на задачу: цикл событий держит на задачи только слабые ссылки, и задача без ссылок может быть удалена сборщиком мусора, не доработав.

## as_completed: обрабатывать по мере готовности

`gather` ждёт всех. Если результаты полезны сразу — например, показывать пользователю ответы по мере поступления, — используйте `asyncio.as_completed`: он выдаёт ожидания в порядке **завершения**:

```python
import asyncio


async def search(source, latency):
    await asyncio.sleep(latency)
    return f"{source} ({latency} с)"


async def main():
    jobs = [search("веб", 0.3), search("векторная база", 0.1), search("вики", 0.2)]
    order = []
    for next_done in asyncio.as_completed(jobs):
        order.append(await next_done)
    return order


print(asyncio.run(main()))
```

```text
['векторная база (0.1 с)', 'вики (0.2 с)', 'веб (0.3 с)']
```

## TaskGroup: группа задач

Python 3.11 добавил `asyncio.TaskGroup` — современный способ запускать группу задач. Блок `async with` не завершится, пока не закончатся все задачи группы; если одна из задач упала, остальные **отменяются**, а ошибки собираются в `ExceptionGroup`:

```python
import asyncio


async def step(name, delay):
    await asyncio.sleep(delay)
    return name.upper()


async def main():
    async with asyncio.TaskGroup() as group:
        a = group.create_task(step("эмбеддинги", 0.1))
        b = group.create_task(step("поиск", 0.2))
    return a.result(), b.result()


print(asyncio.run(main()))
```

```text
('ЭМБЕДДИНГИ', 'ПОИСК')
```

TaskGroup реализует принцип **структурной конкурентности**: задачи не «утекают» за пределы блока, и ни одна ошибка не потеряется. Для задач, где отдельные сбои допустимы, удобнее `gather(..., return_exceptions=True)`.

## Таймауты

Сеть ненадёжна: сервер может зависнуть, а ответ — не прийти никогда. Любое сетевое ожидание должно иметь **таймаут**. Два способа:

```python
import asyncio


async def slow_model():
    await asyncio.sleep(5)
    return "ответ"


async def main():
    try:
        return await asyncio.wait_for(slow_model(), timeout=0.1)
    except TimeoutError:
        print("модель не ответила за 0.1 с")

    try:
        async with asyncio.timeout(0.1):
            await slow_model()
    except TimeoutError:
        print("блок не уложился в 0.1 с")
    return "резервный ответ"


print(asyncio.run(main()))
```

```text
модель не ответила за 0.1 с
блок не уложился в 0.1 с
резервный ответ
```

- `asyncio.wait_for(aw, timeout)` — ждать одну операцию не дольше `timeout` секунд;
- `async with asyncio.timeout(seconds):` (Python 3.11+) — ограничить время целого блока кода, сколько бы операций в нём ни было.

При превышении таймаута ожидаемая операция **отменяется**, а наружу выходит `TimeoutError`. Программа может повторить запрос, переключиться на запасную модель или вернуть понятное сообщение об ошибке.

## Отмена задач

Отмена — штатный механизм asyncio: `task.cancel()` бросает внутрь задачи исключение `asyncio.CancelledError` в ближайшей точке `await`. Задача может перехватить его, чтобы прибраться (закрыть соединение), но затем должна пробросить дальше:

```python
import asyncio


async def long_job(log):
    try:
        await asyncio.sleep(10)
    except asyncio.CancelledError:
        log.append("уборка после отмены")
        raise


async def main():
    log = []
    task = asyncio.create_task(long_job(log))
    await asyncio.sleep(0.05)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        log.append("задача отменена")
    return log, task.cancelled()


print(asyncio.run(main()))
```

```text
(['уборка после отмены', 'задача отменена'], True)
```

Таймауты внутри устроены именно так: по истечении времени задача отменяется.

Отмена — кооперативная, как и всё в asyncio: задача узнаёт об отмене только в ближайшей точке `await`. Корутина, которая долго вычисляет без `await`, не может быть прервана ни отменой, ни таймаутом, пока сама не дойдёт до ожидания. Это ещё одна причина держать вычисления в корутинах короткими. Кроме того, отменённая задача может не успеть сделать всё задуманное, поэтому важные действия при завершении (закрыть соединение, записать журнал) размещают в `finally` или в обработчике `CancelledError`.

## Разбор задачи: гонка моделей с запасным вариантом

Частая схема в продакшене: отправить запрос основной модели с таймаутом; если не ответила вовремя — использовать быструю запасную модель. А для пакета вопросов — обработать всё одновременно, не теряя результаты при отдельных сбоях:

```python
import asyncio

LATENCY = {"большая": 0.3, "маленькая": 0.05}


async def call_model(model, question):
    await asyncio.sleep(LATENCY[model])
    if "сломай" in question:
        raise RuntimeError("внутренняя ошибка модели")
    return f"[{model}] ответ на «{question}»"


async def answer(question, timeout):
    try:
        return await asyncio.wait_for(call_model("большая", question), timeout)
    except TimeoutError:
        return await call_model("маленькая", question)


async def main():
    questions = ["что такое asyncio?", "сломай сервер", "зачем таймауты?"]
    fast = await answer(questions[0], timeout=1.0)
    fallback = await answer(questions[0], timeout=0.1)
    batch = await asyncio.gather(*(answer(q, 1.0) for q in questions), return_exceptions=True)
    return fast, fallback, batch


fast, fallback, batch = asyncio.run(main())
print(fast)
print(fallback)
for item in batch:
    print("ОШИБКА:" if isinstance(item, Exception) else "OK:", item)
```

```text
[большая] ответ на «что такое asyncio?»
[маленькая] ответ на «что такое asyncio?»
OK: [большая] ответ на «что такое asyncio?»
ОШИБКА: внутренняя ошибка модели
OK: [большая] ответ на «зачем таймауты?»
```

- `wait_for` ограничивает ожидание основной модели; при `TimeoutError` срабатывает запасной путь;
- `gather(..., return_exceptions=True)` обрабатывает пакет одновременно, и ошибка одного вопроса не теряет остальные ответы;
- весь пакет занимает около 0.3 с — время одной «большой» модели, а не трёх.

## Попробуйте сами

- Добавьте в `gather` из первого примера четвёртую модель с задержкой 1 с. Сколько займёт выполнение?
- В примере с `create_task` поменяйте местами задержки 0.2 и 0.1 и посмотрите, что напечатает `done()`.
- Перепишите пакетную обработку разбора через `TaskGroup` и посмотрите, что произойдёт с ошибкой «сломай сервер».

## Частые ошибки

**1. Последовательные await вместо gather.** `for q in questions: await answer(q)` — по одному. Для одновременности — `gather` или задачи.

**2. Потеря результатов при одной ошибке.** Без `return_exceptions=True` первая же ошибка в `gather` прерывает ожидание. Для пакетов используйте этот параметр и проверяйте результаты.

**3. Задача без ссылки.** `asyncio.create_task(job())` без сохранения результата — задача может быть собрана сборщиком мусора и не доработать; её ошибки никто не увидит.

**4. Сетевые ожидания без таймаута.** Зависший сервер подвесит программу навсегда. Оборачивайте внешние вызовы в `wait_for` или `asyncio.timeout`.

**5. Проглатывание CancelledError.** `except asyncio.CancelledError: pass` ломает отмену и таймауты. После уборки делайте `raise`.

**6. `except Exception` вокруг await в Python 3.7 и раньше.** В старых версиях `CancelledError` был потомком `Exception` и перехватывался случайно; с Python 3.8 он наследует `BaseException`.

## Где это в AI-инженерии

- **Пакетная обработка** датасетов через LLM: `gather` с `return_exceptions=True` и ограничением одновременности (урок 4).
- **Параллельный поиск в RAG**: векторная база, полнотекстовый индекс и веб-поиск запрашиваются одновременно через `gather` или `TaskGroup`.
- **Запасные модели и таймауты**: схема «основная модель → по таймауту запасная» повышает надёжность сервисов.
- **Агенты** выполняют независимые вызовы инструментов одновременно — многие LLM API возвращают сразу несколько вызовов инструментов в одном ответе.
- **Стриминг в интерфейсах**: `as_completed` позволяет показывать ответы по мере готовности.

## Итоги урока

- `await asyncio.gather(*coros)` — одновременное выполнение; результаты в порядке аргументов; `return_exceptions=True` — ошибки как значения.
- `asyncio.create_task(coro)` — запустить в фоне; сохраняйте ссылку и потом `await task`.
- `asyncio.as_completed` — обработка в порядке завершения; `TaskGroup` — группа задач с отменой при ошибке.
- `asyncio.wait_for(aw, timeout)` и `async with asyncio.timeout(s)` — таймауты, при превышении — `TimeoutError`.
- `task.cancel()` бросает `CancelledError` в задаче; после уборки его нужно пробросить.
