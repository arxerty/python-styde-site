# Эталонное решение: менеджер задач

Ниже — полная программа, собранная из всех восьми этапов в один файл `taskman.py`. Её можно запустить на своём компьютере командой `python taskman.py` — задачи будут сохраняться в `tasks.json` рядом с программой.

```python norun
"""Менеджер задач в консоли."""
import json
from datetime import date

PRIORITIES = ("low", "medium", "high")


def validate_title(title):
    """Проверить и нормализовать название задачи."""
    if not isinstance(title, str) or not title.strip():
        raise ValueError("название задачи не может быть пустым")
    return title.strip()


def validate_priority(priority):
    """Проверить, что приоритет — low, medium или high."""
    if priority not in PRIORITIES:
        raise ValueError("приоритет должен быть одним из: low, medium, high")
    return priority


def validate_due(due):
    """Проверить срок в формате ГГГГ-ММ-ДД; None — срока нет."""
    if due is None:
        return None
    try:
        parsed = date.fromisoformat(due)
    except (TypeError, ValueError):
        parsed = None
    if parsed is None or parsed.isoformat() != due:
        raise ValueError(f"дата должна быть в формате ГГГГ-ММ-ДД, получено {due!r}")
    return due


def make_task(task_id, title, priority="medium", due=None):
    """Создать словарь задачи после проверки полей."""
    return {
        "id": task_id,
        "title": validate_title(title),
        "priority": validate_priority(priority),
        "due": validate_due(due),
        "done": False,
    }


def next_id(tasks):
    """Вернуть номер для новой задачи: на единицу больше максимального."""
    return max((task["id"] for task in tasks), default=0) + 1


def add_task(tasks, title, priority="medium", due=None):
    """Создать задачу, добавить её в список и вернуть."""
    task = make_task(next_id(tasks), title, priority, due)
    tasks.append(task)
    return task


class TaskNotFoundError(Exception):
    """Задача с таким номером не найдена."""


VALIDATORS = {"title": validate_title, "priority": validate_priority, "due": validate_due}


def find_task(tasks, task_id):
    """Найти задачу по номеру или бросить TaskNotFoundError."""
    for task in tasks:
        if task["id"] == task_id:
            return task
    raise TaskNotFoundError(f"задача #{task_id} не найдена")


def complete_task(tasks, task_id):
    """Отметить задачу выполненной и вернуть её."""
    task = find_task(tasks, task_id)
    task["done"] = True
    return task


def update_task(tasks, task_id, **changes):
    """Изменить поля задачи (title, priority, due) после проверки."""
    task = find_task(tasks, task_id)
    for field in changes:
        if field not in VALIDATORS:
            raise ValueError(f"поле {field} нельзя изменить")
    validated = {field: VALIDATORS[field](value) for field, value in changes.items()}
    task.update(validated)
    return task


def delete_task(tasks, task_id):
    """Удалить задачу из списка и вернуть её."""
    task = find_task(tasks, task_id)
    tasks.remove(task)
    return task


PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def filter_tasks(tasks, *, done=None, priority=None, query=None, due_before=None):
    """Вернуть задачи, подходящие под все заданные условия."""
    result = []
    for task in tasks:
        if done is not None and task["done"] != done:
            continue
        if priority is not None and task["priority"] != priority:
            continue
        if query and query.lower() not in task["title"].lower():
            continue
        if due_before is not None and (task["due"] is None or task["due"] >= due_before):
            continue
        result.append(task)
    return result


def sort_tasks(tasks):
    """Вернуть задачи по порядку: невыполненные, по приоритету, по сроку, по номеру."""
    return sorted(
        tasks,
        key=lambda task: (
            task["done"],
            PRIORITY_RANK[task["priority"]],
            task["due"] is None,
            task["due"] or "",
            task["id"],
        ),
    )



class StorageError(Exception):
    """Файл с задачами повреждён."""


def save_tasks(path, tasks):
    """Сохранить задачи в JSON-файл."""
    with open(path, "w", encoding="utf-8") as file:
        json.dump(tasks, file, ensure_ascii=False, indent=2)


def load_tasks(path):
    """Загрузить задачи из JSON-файла; нет файла — пустой список."""
    try:
        with open(path, encoding="utf-8") as file:
            data = json.load(file)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError as error:
        raise StorageError(f"файл {path} повреждён") from error
    if not isinstance(data, list):
        raise StorageError(f"файл {path} должен содержать список задач")
    return data


def is_overdue(task, today):
    """Проверить, просрочена ли невыполненная задача на дату today."""
    return not task["done"] and task["due"] is not None and task["due"] < today


def format_task(task, today=None):
    """Собрать строку задачи для вывода."""
    mark = "x" if task["done"] else " "
    details = task["priority"]
    if task["due"]:
        details += f", до {task['due']}"
    line = f"[{mark}] #{task['id']} {task['title']} ({details})"
    if today and is_overdue(task, today):
        line += " — просрочено"
    return line


def task_stats(tasks, today):
    """Посчитать статистику по задачам."""
    done = sum(1 for task in tasks if task["done"])
    return {
        "total": len(tasks),
        "done": done,
        "active": len(tasks) - done,
        "overdue": sum(1 for task in tasks if is_overdue(task, today)),
    }


HELP = (
    "Команды: add <название> [!low|!medium|!high] [@ГГГГ-ММ-ДД], done <номер>, del <номер>, "
    "rename <номер> <название>, list [all], find <текст>, stats, help, выход"
)


def parse_add(words):
    """Разобрать аргументы add: слова названия, !приоритет и @срок."""
    priority = "medium"
    due = None
    title_words = []
    for word in words:
        if word.startswith("!") and len(word) > 1:
            priority = word[1:]
        elif word.startswith("@") and len(word) > 1:
            due = word[1:]
        else:
            title_words.append(word)
    return " ".join(title_words), priority, due


def parse_id(text):
    """Преобразовать номер задачи в int с понятной ошибкой."""
    try:
        return int(text)
    except ValueError:
        raise ValueError("номер задачи должен быть числом") from None


def format_list(tasks, today):
    """Отформатировать список задач в порядке sort_tasks."""
    return "\n".join(format_task(task, today) for task in sort_tasks(tasks))


def handle_command(tasks, line, today):
    """Выполнить команду пользователя и вернуть текст ответа."""
    words = line.split()
    try:
        match words:
            case []:
                return ""
            case ["add", *rest]:
                title, priority, due = parse_add(rest)
                return "Добавлена: " + format_task(add_task(tasks, title, priority, due))
            case ["done", number]:
                task = complete_task(tasks, parse_id(number))
                return f"Выполнена: #{task['id']} {task['title']}"
            case ["del", number]:
                task = delete_task(tasks, parse_id(number))
                return f"Удалена: #{task['id']} {task['title']}"
            case ["rename", number, *title]:
                task = update_task(tasks, parse_id(number), title=" ".join(title))
                return "Изменена: " + format_task(task)
            case ["list"]:
                active = filter_tasks(tasks, done=False)
                return format_list(active, today) if active else "Задач нет"
            case ["list", "all"]:
                return format_list(tasks, today) if tasks else "Задач нет"
            case ["find", *query] if query:
                found = filter_tasks(tasks, query=" ".join(query))
                return format_list(found, today) if found else "Ничего не найдено"
            case ["stats"]:
                stats = task_stats(tasks, today)
                return (
                    f"Всего: {stats['total']}, выполнено: {stats['done']}, "
                    f"активных: {stats['active']}, просрочено: {stats['overdue']}"
                )
            case ["help"]:
                return HELP
            case [command, *_]:
                return f"Неизвестная команда: {command}. Введите help"
    except (ValueError, TaskNotFoundError) as error:
        return f"Ошибка: {error}"


STORAGE = "tasks.json"
CHANGING_COMMANDS = {"add", "done", "del", "rename"}


def main():
    """Запустить интерактивный менеджер задач."""
    today = date.today().isoformat()
    try:
        tasks = load_tasks(STORAGE)
    except StorageError as error:
        print(f"Ошибка: {error}. Начинаем с пустого списка.")
        tasks = []
    print("Менеджер задач. Введите help для списка команд, выход — для завершения.")
    while True:
        try:
            line = input("> ")
        except EOFError:
            break
        if line.strip() in ("выход", "exit"):
            break
        result = handle_command(tasks, line, today)
        if result:
            print(result)
        words = line.split()
        if words and words[0] in CHANGING_COMMANDS:
            save_tasks(STORAGE, tasks)
    print("До встречи!")


if __name__ == "__main__":
    main()
```

## Разбор архитектуры

**Слои программы.** Код организован снизу вверх, от простого к сложному:

1. **Проверки полей** (`validate_*`) — каждая отвечает за одно поле, возвращает нормализованное значение или бросает `ValueError`. Они не знают ни о списке задач, ни о пользователе.
2. **Операции над данными** (`make_task`, `add_task`, `find_task`, `update_task`, `delete_task`, `filter_tasks`, `sort_tasks`) — чистые функции над списком словарей. Ошибка «задача не найдена» — собственное исключение `TaskNotFoundError`.
3. **Хранение** (`save_tasks`, `load_tasks`) — единственное место, которое знает о JSON и файлах. Захотите хранить задачи в базе данных (блок 4.4) — поменяется только этот слой.
4. **Представление** (`format_task`, `task_stats`) — превращение данных в текст для человека.
5. **Команды** (`handle_command`) — разбор строки и вызов нужной операции. Функция возвращает текст, а не печатает его, поэтому её можно проверить тестами и подключить к любому интерфейсу.
6. **Интерфейс** (`main`) — единственное место с `input` и `print`.

Каждый слой использует только нижележащие. Это главный архитектурный урок проекта: **зависимости направлены в одну сторону**, и изменение верхнего слоя не затрагивает нижние.

**Решения, на которые стоит обратить внимание:**

- `next_id` берёт максимум существующих номеров, а не длину списка: после удаления задачи номера не повторяются.
- `update_task` сначала проверяет **все** изменения, а потом применяет — задача не остаётся «наполовину изменённой».
- Даты хранятся строками `ГГГГ-ММ-ДД`: такой формат читается человеком, корректно сериализуется в JSON и сравнивается обычными `<` и `>`.
- Текущая дата передаётся параметром `today`, а не вычисляется внутри функций — поэтому их результат предсказуем и тестируем. `date.today()` вызывается только в `main`.
- Ключ сортировки — кортеж из нескольких признаков: статус, ранг приоритета, наличие срока, срок, номер.
- `handle_command` использует `match` с образцами-списками: команда с неверным числом аргументов просто не совпадает с образцом.
- Ошибки пользователя (`ValueError`, `TaskNotFoundError`) перехватываются в одном месте и превращаются в понятные сообщения; повреждённый файл — в сообщение при запуске.

## Как развивать проект

- **Теги и проекты**: поле `tags` (список строк) и команда `find #тег`.
- **Повторяющиеся задачи**: поле `repeat` («daily», «weekly») и автоматическое создание следующей задачи при выполнении.
- **Отмена**: стек последних изменений и команда `undo` (стек — список с `append` и `pop`).
- **Классы**: в части 2 задача станет классом `Task` (dataclass), а список — классом `TaskManager` с методами вместо функций.
- **Тесты**: в блоке 2.8 вы напишете для этих функций тесты на pytest — они почти готовы в виде проверок этапов.
- **AI-помощник**: в части 7 можно добавить команду `plan <цель>`, которая просит языковую модель разбить цель на задачи и возвращает их в JSON — `handle_command` уже готов принимать такие данные через `add_task`.