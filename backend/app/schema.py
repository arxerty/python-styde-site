"""Схема файлов контента курса.

Эти Pydantic-модели — единственный источник правды о формате контента.
Человекочитаемое описание с примерами — docs/CONTENT_SCHEMA.md.
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Slug = str  # латиница, цифры, дефис: q1, t2, stage-01


class Strict(BaseModel):
    # Лишние поля — ошибка: опечатка в имени поля не должна молча теряться
    model_config = ConfigDict(extra="forbid")


# ---------- part.yaml ----------

class PartMeta(Strict):
    title: str
    description: str = ""
    # browser — весь код выполняется в браузере (Pyodide)
    # local   — задания выполняются у ученика локально (pytest)
    # mixed   — встречаются оба типа
    runtime: Literal["browser", "local", "mixed"] = "browser"
    optional: bool = False  # необязательная часть (демо): не блокирует следующие и не входит в прогресс курса


# ---------- block.yaml ----------

class LessonRef(Strict):
    id: Slug  # имя файлов урока без расширения: lesson-01
    title: str


class BlockMeta(Strict):
    title: str
    description: str = ""
    lessons: list[LessonRef]
    mini_project: str = ""  # название мини-проекта практикума (для карточки блока)

    @model_validator(mode="after")
    def unique_lessons(self) -> "BlockMeta":
        ids = [lesson.id for lesson in self.lessons]
        if len(ids) != len(set(ids)):
            raise ValueError("id уроков в block.yaml повторяются")
        return self


# ---------- вопросы ----------

class Option(Strict):
    text: str  # Markdown
    correct: bool = False
    why: str = ""  # почему вариант верен/неверен — показывается после ответа


class Question(Strict):
    id: Slug
    # single   — один правильный ответ
    # multiple — несколько правильных ответов
    # output   — «что выведет код?» (поле code обязательно)
    # find_bug — «найди ошибку» (поле code обязательно)
    type: Literal["single", "multiple", "output", "find_bug"]
    prompt: str  # Markdown
    code: str = ""  # код, показываемый под вопросом
    options: list[Option] = Field(default_factory=list)
    answer: str = ""  # ввод ответа текстом (вместо options) — сравнение без учёта пробелов по краям
    explanation: str  # общий разбор после ответа

    @model_validator(mode="after")
    def check(self) -> "Question":
        if self.type in ("output", "find_bug") and not self.code.strip():
            raise ValueError(f"вопрос {self.id}: для типа {self.type} нужно поле code")
        if not self.options and not self.answer:
            raise ValueError(f"вопрос {self.id}: нужны options или answer")
        if self.options:
            correct = sum(option.correct for option in self.options)
            if self.type == "multiple":
                if correct < 1:
                    raise ValueError(f"вопрос {self.id}: нет правильных вариантов")
            elif correct != 1:
                raise ValueError(f"вопрос {self.id}: должен быть ровно один правильный вариант, найдено {correct}")
            if len(self.options) < 2:
                raise ValueError(f"вопрос {self.id}: нужно минимум 2 варианта")
        return self


# ---------- задачи ----------

class TestCase(Strict):
    name: str  # видно ученику в отчёте («Пустой список», «Отрицательные числа»)
    stdin: str | None = None  # данные для input(), строки через \n
    setup: str | None = None  # код этого теста перед кодом ученика (после setup задачи): bill = 100
    # Вид проверки — ровно один из:
    call: str | None = None  # выражение, например "add(2, 3)" ...
    expected: str | None = None  # ... и ожидаемое значение как Python-выражение: "5", "[1, 2]", "'abc'"
    stdout: str | None = None  # точный вывод программы (пробелы в конце строк не важны)
    stdout_contains: list[str] | None = None  # подстроки, которые должны быть в выводе
    code: str | None = None  # произвольный код с assert, выполняется после кода ученика

    @model_validator(mode="after")
    def one_kind(self) -> "TestCase":
        kinds = [
            self.call is not None,
            self.stdout is not None,
            self.stdout_contains is not None,
            self.code is not None,
        ]
        if sum(kinds) != 1:
            raise ValueError(f"тест «{self.name}»: нужен ровно один вид проверки: call+expected, stdout, stdout_contains или code")
        if self.call is not None and self.expected is None:
            raise ValueError(f"тест «{self.name}»: для call нужно поле expected")
        return self


class Example(Strict):
    input: str  # пример входа: вызов функции или ввод с клавиатуры
    output: str  # результат
    explanation: str = ""


class Constraints(Strict):
    require: list[str] = Field(default_factory=list)  # подстроки, которые обязаны быть в коде ученика
    forbid: list[str] = Field(default_factory=list)  # подстроки, которых не должно быть
    message: str = ""  # пояснение ограничения


class Task(Strict):
    id: Slug
    title: str
    # browser — проверка в браузере (Pyodide); local — ученик запускает pytest у себя
    mode: Literal["browser", "local"] = "browser"
    difficulty: int = Field(1, ge=1, le=3)  # 1 — простая, 2 — средняя, 3 — сложная
    statement: str  # условие, Markdown
    examples: list[Example] = Field(default_factory=list)
    starter: str = ""  # заготовка в редакторе (browser)
    hints: list[str] = Field(min_length=1)  # подсказки по уровням (обычно 2)
    solution: str = ""  # эталонное решение (browser) — основной файл для local
    solution_explanation: str  # разбор решения, Markdown
    tests: list[TestCase] = Field(default_factory=list)  # скрытые тесты (browser)
    setup: str = ""  # код, выполняемый перед кодом ученика в каждом тесте
    files: dict[str, str] = Field(default_factory=dict)  # browser: файлы в виртуальной ФС; local: файлы заготовки проекта
    assets: list[str] = Field(default_factory=list)  # пути к файлам из папки блока (data/titanic.csv)
    constraints: Constraints | None = None
    timeout: int = Field(10, ge=1, le=120)  # секунд на один запуск
    mini_project: bool = False  # пометка мини-проекта в практикуме
    # --- только для local ---
    run: str = "pytest -q"  # команда запуска тестов у ученика
    solution_files: dict[str, str] = Field(default_factory=dict)  # эталонные версии файлов (перекрывают files)

    @model_validator(mode="after")
    def check(self) -> "Task":
        if self.mode == "browser":
            if not self.tests:
                raise ValueError(f"задача {self.id}: для browser нужны tests")
            if not self.solution.strip():
                raise ValueError(f"задача {self.id}: нет solution")
        else:
            if not self.files:
                raise ValueError(f"задача {self.id}: для local нужны files (заготовка + тесты)")
            if not (self.solution_files or self.solution.strip()):
                raise ValueError(f"задача {self.id}: нужен solution или solution_files")
        return self


# ---------- lesson-NN.yaml ----------

class LessonData(Strict):
    questions: list[Question] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_ids(self) -> "LessonData":
        _ensure_unique([q.id for q in self.questions], "вопросов")
        _ensure_unique([t.id for t in self.tasks], "задач")
        return self


# ---------- practicum.yaml ----------

class Practicum(LessonData):
    title: str = "Практикум"
    description: str = ""
    pass_threshold: float = Field(0.7, gt=0, le=1)


# ---------- project/project.yaml ----------

class Stage(Strict):
    id: Slug
    title: str
    description: str  # что сделать на этапе, Markdown
    hints: list[str] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)  # автоматические проверки этапа
    criteria: list[str] = Field(default_factory=list)  # чек-лист самопроверки


class Project(Strict):
    title: str
    description: str  # ТЗ целиком, Markdown
    mode: Literal["browser", "local"] = "browser"
    requirements: list[str] = Field(default_factory=list)
    stages: list[Stage] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_stages(self) -> "Project":
        _ensure_unique([s.id for s in self.stages], "этапов")
        return self


def _ensure_unique(ids: list[str], what: str) -> None:
    seen = set()
    for item_id in ids:
        if item_id in seen:
            raise ValueError(f"повторяющийся id {what}: {item_id}")
        seen.add(item_id)
