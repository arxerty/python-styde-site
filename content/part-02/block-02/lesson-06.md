# Enum: перечисления

## Проблема «магических строк»

Во многих местах программы значение может быть только одним из фиксированного набора: роль сообщения (`system`, `user`, `assistant`), статус задачи (`queued`, `running`, `done`, `failed`), размер модели (`small`, `medium`, `large`). Обычно такие значения хранят строками:

```python
def can_cancel(status):
    return status in ("queued", "running")


print(can_cancel("running"))
print(can_cancel("Running"))
print(can_cancel("runing"))
```

```text
True
False
False
```

Опечатка `"runing"` или другой регистр `"Running"` не вызывают ошибки — функция молча даёт неверный ответ. Набор допустимых значений нигде не записан явно: чтобы узнать, какие статусы бывают, приходится искать по всему коду. Такие строки называют «магическими».

**Перечисление** (`Enum`) — специальный класс, описывающий фиксированный набор именованных значений. Опечатка в имени сразу превращается в ошибку, а все варианты собраны в одном месте.

## Основы Enum

```python
from enum import Enum


class Status(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


status = Status.RUNNING
print(status)
print(repr(status))
print(status.name, status.value)
print(status == Status.RUNNING, status is Status.RUNNING)
print(type(status).__name__, isinstance(status, Status))
```

```text
Status.RUNNING
<Status.RUNNING: 'running'>
RUNNING running
True True
Status True
```

- Каждый атрибут класса-перечисления — **член** (member) перечисления: `Status.RUNNING`. Это объект класса `Status`, а не строка.
- У члена есть `name` (имя в коде, `"RUNNING"`) и `value` (значение, `"running"`).
- Каждый член существует в одном экземпляре, поэтому сравнивать можно и через `==`, и через `is`.
- Имена членов пишут ЗАГЛАВНЫМИ буквами — это константы.

Опечатка теперь ловится сразу:

```python
from enum import Enum


class Status(Enum):
    QUEUED = "queued"
    RUNNING = "running"


try:
    Status.RUNIN
except AttributeError as error:
    print(error)
```

```text
type object 'Status' has no attribute 'RUNIN'
```

А редактор при вводе `Status.` подскажет все допустимые варианты.

## Получение члена по значению и по имени

Данные из JSON, базы или от пользователя приходят строками. Превратить строку в член перечисления можно двумя способами:

```python
from enum import Enum


class Status(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"


print(Status("done"))
print(Status["QUEUED"])
try:
    Status("cancelled")
except ValueError as error:
    print(error)
```

```text
Status.DONE
Status.QUEUED
'cancelled' is not a valid Status
```

- `Status("done")` — поиск **по значению** (вызов класса);
- `Status["QUEUED"]` — поиск **по имени** (как в словаре);
- неизвестное значение — `ValueError`, неизвестное имя — `KeyError`.

Так перечисление работает как встроенная **валидация**: на границе программы строка превращается в `Status`, и дальше по коду ходят только допустимые значения.

## Перебор и количество

Класс-перечисление можно перебирать, у него есть длина, и проверка принадлежности работает для членов:

```python
from enum import Enum


class Size(Enum):
    SMALL = 1
    MEDIUM = 2
    LARGE = 3


print([size.name for size in Size])
print(len(Size))
print(Size.SMALL in Size)
print([size.value for size in Size if size.value >= 2])
```

```text
['SMALL', 'MEDIUM', 'LARGE']
3
True
[2, 3]
```

Порядок перебора — порядок объявления. Это удобно для построения меню, выпадающих списков и проверки, что обработаны все варианты.

## auto(): значения по умолчанию

Если конкретные значения не важны, их можно сгенерировать функцией `auto()`. Для обычного `Enum` это числа 1, 2, 3…

```python
from enum import Enum, auto


class Stage(Enum):
    LOAD = auto()
    CLEAN = auto()
    TRAIN = auto()
    EVALUATE = auto()


print([(stage.name, stage.value) for stage in Stage])
```

```text
[('LOAD', 1), ('CLEAN', 2), ('TRAIN', 3), ('EVALUATE', 4)]
```

## Члены перечисления — не строки и не числа

Важная особенность обычного `Enum`: его члены **не равны** своим значениям.

```python
from enum import Enum


class Role(Enum):
    USER = "user"
    ASSISTANT = "assistant"


print(Role.USER == "user")
print(Role.USER.value == "user")
```

```text
False
True
```

Это сделано намеренно — чтобы не перепутать «просто строку» и проверенное значение. Но при работе с JSON и API это неудобно: `json.dumps` не умеет сериализовать обычный `Enum`. Для таких случаев есть **`StrEnum`** (Python 3.11+) и **`IntEnum`** — их члены одновременно являются строками или числами:

```python
import json
from enum import StrEnum, IntEnum


class Role(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class Priority(IntEnum):
    LOW = 1
    HIGH = 2


message = {"role": Role.USER, "content": "Привет"}
print(json.dumps(message, ensure_ascii=False))
print(Role.USER == "user", Role.USER.upper())
print(Priority.HIGH > Priority.LOW, Priority.HIGH + 1)
```

```text
{"role": "user", "content": "Привет"}
True USER
True 3
```

`StrEnum` идеален для значений, которые уходят в JSON, API или базу данных: роли сообщений, имена моделей, статусы. `IntEnum` — когда нужны сравнения по порядку и арифметика (уровни приоритета, коды).

## Методы и свойства перечислений

Перечисление — это класс, поэтому в нём можно определять методы и свойства. Так логика, связанная со значениями, живёт рядом с ними:

```python
from enum import Enum


class Status(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"

    @property
    def is_final(self):
        return self in (Status.DONE, Status.FAILED)

    def can_move_to(self, new_status):
        allowed = {
            Status.QUEUED: {Status.RUNNING, Status.FAILED},
            Status.RUNNING: {Status.DONE, Status.FAILED},
        }
        return new_status in allowed.get(self, set())


print(Status.DONE.is_final, Status.RUNNING.is_final)
print(Status.QUEUED.can_move_to(Status.RUNNING))
print(Status.DONE.can_move_to(Status.RUNNING))
```

```text
True False
True
False
```

Члены перечисления хешируемы, поэтому их можно использовать как ключи словарей и элементы множеств — как в `allowed` выше.

## Enum и match

Перечисления отлично сочетаются с `match` из блока 1.3. Имена членов с точкой (`Status.DONE`) в `case` сравниваются как значения:

```python
from enum import Enum


class Command(Enum):
    START = "start"
    STOP = "stop"
    STATUS = "status"


def handle(command):
    match command:
        case Command.START:
            return "запускаю обучение"
        case Command.STOP:
            return "останавливаю"
        case Command.STATUS:
            return "эпоха 3 из 10"


for text in ("start", "status"):
    print(handle(Command(text)))
```

```text
запускаю обучение
эпоха 3 из 10
```

Строка от пользователя превращается в `Command` один раз (`Command(text)`), а дальше `match` работает с проверенными значениями.

## Flag: комбинации флагов

Иногда нужно хранить **набор** вариантов одновременно: права доступа, возможности модели. Для этого есть `Flag` — члены можно объединять оператором `|` и проверять через `in`:

```python
from enum import Flag, auto


class Capability(Flag):
    TEXT = auto()
    VISION = auto()
    TOOLS = auto()
    AUDIO = auto()


model = Capability.TEXT | Capability.VISION | Capability.TOOLS
print(Capability.VISION in model, Capability.AUDIO in model)
print([cap.name for cap in Capability if cap in model])
```

```text
True False
['TEXT', 'VISION', 'TOOLS']
```

Для `Flag` функция `auto()` выдаёт степени двойки (1, 2, 4, 8…), чтобы флаги можно было объединять побитово.

## Когда перечисление нужно, а когда нет

Перечисление стоит заводить, когда выполняются три условия: набор значений **конечный**, он **известен заранее** и **меняется редко**. Роли сообщений, статусы задач, режимы работы, дни недели — классические кандидаты.

Плохие кандидаты — наборы, которые растут вместе с данными: названия товаров, имена пользователей, список моделей, который обновляется каждую неделю у провайдера. Если каждое новое значение требует правки кода и релиза, перечисление станет тормозом. Такие значения хранят в конфигурации или базе данных, а проверяют при загрузке.

Ещё один ориентир — сколько мест в коде принимают решения по значению. Если статус лишь пишется в лог, достаточно строки. Если от него зависят ветвления в пяти функциях, перечисление окупится сразу: редактор подскажет варианты, опечатки станут ошибками, а методы и свойства соберут логику в одном месте.

В блоке 2.5 вы встретите альтернативу для простых случаев — тип `Literal["user", "assistant"]`: он ограничивает строку набором значений на уровне проверки типов, не создавая отдельного класса.

## Разбор задачи: задачи обучения со статусами

Соберём перечисления, датакласс и проверку переходов в небольшую систему управления задачами обучения: статус меняется только по разрешённым переходам, а данные приходят и уходят в JSON строками.

```python
import json
from dataclasses import dataclass, field
from enum import StrEnum


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


TRANSITIONS = {
    JobStatus.QUEUED: {JobStatus.RUNNING, JobStatus.FAILED},
    JobStatus.RUNNING: {JobStatus.DONE, JobStatus.FAILED},
}


@dataclass
class TrainingJob:
    name: str
    status: JobStatus = JobStatus.QUEUED
    history: list = field(default_factory=list)

    def move_to(self, new_status):
        new_status = JobStatus(new_status)
        if new_status not in TRANSITIONS.get(self.status, set()):
            raise ValueError(f"переход {self.status} → {new_status} запрещён")
        self.history.append((self.status, new_status))
        self.status = new_status

    def to_json(self):
        return json.dumps({"name": self.name, "status": self.status})


job = TrainingJob("bert-finetune")
job.move_to("running")
job.move_to(JobStatus.DONE)
print(job.to_json())
print(job.history)
try:
    job.move_to("running")
except ValueError as error:
    print(error)
```

```text
{"name": "bert-finetune", "status": "done"}
[(<JobStatus.QUEUED: 'queued'>, <JobStatus.RUNNING: 'running'>), (<JobStatus.RUNNING: 'running'>, <JobStatus.DONE: 'done'>)]
переход done → running запрещён
```

Обратите внимание:

- `JobStatus(new_status)` принимает и строку, и член перечисления — так `move_to` удобно вызывать из кода и из обработчика HTTP-запроса;
- `StrEnum` позволяет сразу сериализовать статус в JSON и печатать его как строку в сообщении об ошибке;
- словарь переходов описывает **конечный автомат** (state machine) — стандартный способ описывать жизненный цикл задач, заказов и диалогов.

## Попробуйте сами

- Добавьте в `Status` член `CANCELLED` и разрешите переход в него из `QUEUED`.
- Создайте `StrEnum` `Model` с вариантами `SMALL = "gpt-small"` и т.д. и выведите все значения списком.
- Проверьте, что выведет `Role.USER == "user"` для обычного `Enum` и для `StrEnum`.

## Частые ошибки

**1. Сравнение обычного `Enum` со строкой.** `status == "done"` для `Enum` всегда `False`. Сравнивайте с членом (`Status.DONE`), используйте `.value` или `StrEnum`.

**2. Создание из строки неправильным способом.** `Status.done` или `Status["done"]` ищут по имени (`DONE`), а не по значению. По значению — `Status("done")`.

**3. Попытка изменить член.** `Status.DONE = "finished"` → ошибка: перечисление неизменяемо.

**4. Повторяющиеся значения.** Два члена с одним значением — второй становится **псевдонимом** первого и не появляется при переборе. Декоратор `@unique` из `enum` запрещает такие дубли.

**5. `json.dumps` с обычным `Enum`.** `TypeError: Object of type Status is not JSON serializable`. Используйте `StrEnum`/`IntEnum` или `.value`.

**6. Магические строки рядом с перечислением.** Объявили `Status`, но в одном месте всё ещё пишут `if job.status == "running"`. Перечисление помогает, только если им пользуются везде.

## Где это в AI-инженерии

- **Роли сообщений** (`system`, `user`, `assistant`, `tool`) в SDK для LLM часто описаны перечислениями или литералами.
- **Статусы задач**: обучение, батч-обработка, асинхронные запросы к API — у всех есть жизненный цикл `queued → running → done/failed`.
- **Режимы модели**: `model.train()` и `model.eval()` в PyTorch, стратегии сохранения чекпоинтов, типы планировщиков learning rate в конфигурациях Hugging Face описаны перечислениями.
- **Pydantic** (блок 2.5) превращает строки из JSON в члены `Enum` автоматически и отвергает недопустимые значения.
- **Метки классов**: `class Sentiment(IntEnum): NEG = 0; POS = 1` — понятные имена вместо голых чисел в коде классификации.

## Итоги урока

- `Enum` — фиксированный набор именованных значений; опечатка в имени сразу даёт ошибку.
- У члена есть `name` и `value`; `Status("done")` — по значению, `Status["DONE"]` — по имени.
- Перечисление можно перебирать; `auto()` генерирует значения.
- Обычный `Enum` не равен строкам; `StrEnum` и `IntEnum` — равны и сериализуются в JSON.
- В перечислениях можно объявлять методы и свойства; члены хешируемы.
- `Flag` — для комбинаций вариантов через `|`.
