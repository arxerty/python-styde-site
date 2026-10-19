# Батчинг данных генераторами — как DataLoader в ML

## Зачем данные делят на батчи

Модели машинного обучения почти никогда не обрабатывают примеры по одному. Данные подают **батчами** (пакетами) — группами по 16, 32, 256 примеров:

- **Скорость.** GPU выполняет одну операцию над батчем из 64 примеров почти так же быстро, как над одним: вычисления идут параллельно. Обработка по одному оставила бы видеокарту простаивать.
- **Память.** Весь датасет не помещается в память GPU, а батч — помещается. Размер батча — главный рычаг, когда обучение падает с «out of memory».
- **Обучение.** Градиент, усреднённый по батчу, точнее отражает направление улучшения, чем градиент по одному примеру, и вычисляется быстрее, чем по всему датасету.
- **API.** Сервисы эмбеддингов и LLM принимают списки текстов и ограничивают число запросов в минуту: отправить 1000 текстов батчами по 100 — это 10 запросов вместо 1000.

В PyTorch эту работу делает класс `DataLoader`: он перебирает датасет, перемешивает его, нарезает на батчи и собирает примеры в тензоры. В этом уроке вы соберёте его упрощённую версию на генераторах и поймёте, как он устроен.

## itertools.batched

В Python 3.12 в `itertools` появилась функция `batched(iterable, n)` — она нарезает любой итерируемый объект на кортежи по `n` элементов; последний может быть короче:

```python
from itertools import batched

texts = [f"текст {i}" for i in range(1, 8)]
for batch in batched(texts, 3):
    print(batch)
```

```text
('текст 1', 'текст 2', 'текст 3')
('текст 4', 'текст 5', 'текст 6')
('текст 7',)
```

`batched` ленива: она берёт из источника ровно столько элементов, сколько нужно для очередного батча. Поэтому её можно применить к файлу на миллиард строк или к бесконечному генератору.

## Свой батчер на islice

Полезно уметь написать батчер самостоятельно — он понадобится в старых версиях Python и как основа для расширений (например, отбрасывания неполного батча). Ключевой приём — `islice` на **одном и том же** итераторе:

```python
from itertools import islice


def batches(iterable, size, drop_last=False):
    if size < 1:
        raise ValueError("размер батча должен быть положительным")
    iterator = iter(iterable)
    while True:
        batch = list(islice(iterator, size))
        if not batch:
            return
        if drop_last and len(batch) < size:
            return
        yield batch


print(list(batches(range(7), 3)))
print(list(batches(range(7), 3, drop_last=True)))
print(list(batches([], 3)))
```

```text
[[0, 1, 2], [3, 4, 5], [6]]
[[0, 1, 2], [3, 4, 5]]
[]
```

Почему работает: `iter(iterable)` создаётся один раз, и каждый `islice(iterator, size)` забирает следующие `size` элементов — итератор помнит позицию (урок 1). Если бы мы писали `islice(iterable, size)` от списка, каждый раз получали бы одни и те же первые элементы.

Параметр `drop_last` есть и у настоящего `DataLoader`: при обучении неполный последний батч иногда отбрасывают, потому что он искажает статистики (например, в слоях BatchNorm).

## Сборка батча: collate

Примеры датасета обычно — словари: `{"text": ..., "label": ...}`. Модели же нужен батч «по столбцам»: список всех текстов и список всех меток. Превращение списка примеров в такую структуру называется **collate** (сопоставление):

```python
def collate(examples):
    return {key: [example[key] for example in examples] for key in examples[0]}


batch = [
    {"text": "отлично", "label": 1},
    {"text": "ужасно", "label": 0},
    {"text": "нормально", "label": 1},
]
print(collate(batch))
```

```text
{'text': ['отлично', 'ужасно', 'нормально'], 'label': [1, 0, 1]}
```

В PyTorch функция `collate_fn` превращает такие списки ещё и в тензоры, а для текстов — дополняет последовательности до одной длины (padding). Сделаем padding для токенизированных текстов:

```python
def pad_batch(sequences, pad_value=0):
    max_len = max(len(seq) for seq in sequences)
    padded = [seq + [pad_value] * (max_len - len(seq)) for seq in sequences]
    mask = [[1] * len(seq) + [0] * (max_len - len(seq)) for seq in sequences]
    return padded, mask


tokens, mask = pad_batch([[5, 8, 2], [7], [3, 3]])
print(tokens)
print(mask)
```

```text
[[5, 8, 2], [7, 0, 0], [3, 3, 0]]
[[1, 1, 1], [1, 0, 0], [1, 1, 0]]
```

**Маска внимания** (attention mask) сообщает модели, какие позиции — настоящие токены, а какие — заполнение. Ровно такие структуры возвращают токенизаторы Hugging Face.

## Перемешивание и эпохи

При обучении данные проходят многократно — каждый полный проход называется **эпохой**. Перед каждой эпохой данные перемешивают, чтобы модель не запоминала порядок примеров. Для воспроизводимости генератор случайных чисел инициализируют фиксированным зерном (`seed`, блок 1.7):

```python
import random

data = list(range(10))
rng = random.Random(42)
for epoch in range(2):
    order = data[:]
    rng.shuffle(order)
    print(f"эпоха {epoch}:", order)
```

```text
эпоха 0: [7, 3, 2, 8, 5, 6, 9, 4, 0, 1]
эпоха 1: [3, 5, 2, 4, 1, 8, 7, 0, 6, 9]
```

`random.Random(42)` — отдельный генератор со своим состоянием: он не мешает другим частям программы и даёт одну и ту же последовательность перемешиваний при каждом запуске. Порядки в эпохах разные, но воспроизводимые.

## Класс DataLoader

Соберём всё вместе: класс, который хранит датасет и параметры, а `__iter__` (генератор!) выдаёт батчи одной эпохи. Каждый `for` по загрузчику — новая эпоха с новым перемешиванием:

```python
import random
from itertools import batched


class DataLoader:
    def __init__(self, dataset, batch_size, shuffle=False, drop_last=False, seed=0, collate_fn=None):
        self.dataset = dataset
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.drop_last = drop_last
        self.collate_fn = collate_fn or list
        self._rng = random.Random(seed)

    def __len__(self):
        full, rest = divmod(len(self.dataset), self.batch_size)
        return full if self.drop_last or rest == 0 else full + 1

    def __iter__(self):
        indices = list(range(len(self.dataset)))
        if self.shuffle:
            self._rng.shuffle(indices)
        for batch_indices in batched(indices, self.batch_size):
            if self.drop_last and len(batch_indices) < self.batch_size:
                return
            yield self.collate_fn([self.dataset[i] for i in batch_indices])


dataset = [{"x": i, "y": i % 2} for i in range(5)]
loader = DataLoader(dataset, batch_size=2, collate_fn=lambda ex: [e["x"] for e in ex])
print(len(loader), list(loader))
loader = DataLoader(dataset, batch_size=2, drop_last=True, collate_fn=lambda ex: [e["x"] for e in ex])
print(len(loader), list(loader))
```

```text
3 [[0, 1], [2, 3], [4]]
2 [[0, 1], [2, 3]]
```

Обратите внимание на устройство:

- датасету нужны только `__len__` и `__getitem__` — подойдёт список или ваш класс из блока 2.2;
- перемешиваются **индексы**, а не сами данные — датасет не копируется и не меняется;
- `len(loader)` — число батчей, его можно узнать без перебора (нужно для индикаторов прогресса);
- `__iter__` — генератор, поэтому загрузчик многоразовый: каждая эпоха — новый проход.

## Потоковые данные: перемешивание буфером

Что делать, если датасет не помещается в память и доступен только как поток (огромный файл, данные из сети)? Перемешать индексы нельзя — длина неизвестна. Используют **перемешивание буфером**: держат в памяти буфер из N элементов, выдают случайный из них и заменяют его следующим из потока.

```python
import random


def shuffle_buffer(stream, buffer_size, seed=0):
    rng = random.Random(seed)
    buffer = []
    for item in stream:
        buffer.append(item)
        if len(buffer) >= buffer_size:
            index = rng.randrange(len(buffer))
            buffer[index], buffer[-1] = buffer[-1], buffer[index]
            yield buffer.pop()
    rng.shuffle(buffer)
    yield from buffer


print(list(shuffle_buffer(range(10), buffer_size=4, seed=1)))
print(sorted(shuffle_buffer(range(10), buffer_size=4, seed=1)) == list(range(10)))
```

```text
[1, 0, 2, 4, 7, 8, 9, 6, 3, 5]
True
```

Перемешивание неполное — элемент не может уйти далеко от своей исходной позиции, — но чем больше буфер, тем лучше качество. Память ограничена размером буфера, а не датасета. Так перемешивают потоковые датасеты в Hugging Face и `tf.data`. Трюк с обменом на последний элемент и `pop()` удаляет случайный элемент списка за постоянное время.

## Разбор задачи: эмбеддинги батчами с лимитом запросов

Нужно получить эмбеддинги для большой коллекции документов. API принимает не больше 3 текстов за запрос и не больше 2 запросов «в окно». Напишем конвейер, который нарезает поток документов на батчи, отправляет их и выдаёт результаты по одному, соблюдая лимит:

```python
from itertools import batched


class FakeEmbeddingAPI:
    MAX_BATCH = 3

    def __init__(self):
        self.requests = 0

    def embed(self, texts):
        if len(texts) > self.MAX_BATCH:
            raise ValueError("слишком большой батч")
        self.requests += 1
        return [[len(text), text.count(" ")] for text in texts]


def embed_stream(texts, api, batch_size, requests_per_window):
    sent_in_window = 0
    for batch in batched(texts, batch_size):
        if sent_in_window == requests_per_window:
            print("  пауза: ждём новое окно лимита")
            sent_in_window = 0
        vectors = api.embed(list(batch))
        sent_in_window += 1
        yield from zip(batch, vectors)


documents = (f"документ номер {i}" for i in range(1, 8))
api = FakeEmbeddingAPI()
for text, vector in embed_stream(documents, api, batch_size=3, requests_per_window=2):
    print(text, vector)
print("запросов:", api.requests)
```

```text
документ номер 1 [16, 2]
документ номер 2 [16, 2]
документ номер 3 [16, 2]
документ номер 4 [16, 2]
документ номер 5 [16, 2]
документ номер 6 [16, 2]
  пауза: ждём новое окно лимита
документ номер 7 [16, 2]
запросов: 3
```

Что даёт генераторный подход:

- источник документов — генератор, коллекция может быть любого размера;
- снаружи `embed_stream` выглядит как поток пар «текст — вектор», а батчинг спрятан внутри; потребитель (например, запись в векторную базу) ничего о нём не знает;
- пауза для лимита возникает в нужный момент — между запросами; в реальном коде здесь был бы `time.sleep` или асинхронное ожидание (блок 2.7);
- `yield from zip(batch, vectors)` разворачивает ответ батча обратно в отдельные результаты.

## Попробуйте сами

- Добавьте в `DataLoader` параметр `collate_fn=collate` из этого урока и выведите первый батч перемешанного датасета.
- Измените `batches`, чтобы при `drop_last=False` неполный батч дополнялся значением `pad` до полного размера.
- Сравните результаты `shuffle_buffer` с буфером 2 и с буфером 10 для `range(10)`.

## Частые ошибки

**1. `islice` от списка вместо итератора.** `islice(data, size)` для списка каждый раз начинает сначала — бесконечный цикл с одним и тем же батчем. Создайте `iterator = iter(data)` один раз.

**2. Потерянный последний батч.** Условие выхода `if len(batch) < size: return` без проверки `drop_last` выбрасывает хвост данных.

**3. Перемешивание исходного датасета на месте.** `random.shuffle(dataset)` меняет данные, которые могут использоваться где-то ещё. Перемешивайте индексы или копию.

**4. Общий генератор случайных чисел без seed.** Результаты обучения невоспроизводимы. Используйте `random.Random(seed)`.

**5. Одинаковый порядок во всех эпохах.** Если перемешать один раз в `__init__`, каждая эпоха пойдёт в одном порядке. Перемешивайте в `__iter__`.

**6. Неверный `__len__`.** Число батчей — округление вверх (или вниз при `drop_last`). Ошибка в формуле ломает индикаторы прогресса и планировщики learning rate, которые опираются на число шагов.

## Где это в AI-инженерии

- **PyTorch `DataLoader`** — `batch_size`, `shuffle`, `drop_last`, `collate_fn` и ещё параллельная загрузка в нескольких процессах; устроен по той же схеме: перемешивание индексов → батчи → collate.
- **Токенизаторы** возвращают батчи с `input_ids` и `attention_mask` — padding и маска, как в `pad_batch`.
- **Эмбеддинги и LLM API**: батчинг запросов экономит время и деньги, а лимиты запросов требуют пауз между батчами.
- **Hugging Face datasets** в потоковом режиме используют `shuffle(buffer_size=...)` — перемешивание буфером.
- **Инференс**: при обработке миллионов текстов моделью их тоже подают батчами — часто сортируя по длине, чтобы минимизировать padding.

## Итоги урока

- Батчи нужны для скорости на GPU, ограничения памяти, стабильного обучения и экономии запросов к API.
- `itertools.batched(iterable, n)` (Python 3.12) или свой генератор на `islice` по одному итератору.
- `collate` превращает список примеров в структуру «по столбцам»; padding и маска выравнивают последовательности.
- Перемешивайте индексы в начале каждой эпохи генератором `random.Random(seed)`.
- `DataLoader` = датасет с `__len__`/`__getitem__` + перемешивание индексов + батчи + collate; `__iter__`-генератор делает его многоразовым.
- Для потоков — перемешивание буфером фиксированного размера.
