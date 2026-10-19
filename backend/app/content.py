"""Загрузка контента из папки content/.

Структура:
    content/part-XX/part.yaml
    content/part-XX/block-YY/{block.yaml, lesson-NN.md, lesson-NN.yaml, practicum.yaml, cheatsheet.md, data/...}
    content/part-XX/project/{project.yaml, solution.md, data/...}

Новые папки подхватываются автоматически: дерево курса пересобирается,
когда меняется любой файл (сравниваем «отпечаток» — mtime и размеры).
"""
from __future__ import annotations

import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ValidationError

from .config import CONTENT_DIR
from .schema import BlockMeta, LessonData, PartMeta, Practicum, Project

PART_RE = re.compile(r"^part-\d{2}$")
BLOCK_RE = re.compile(r"^block-\d{2}$")


class ContentError(Exception):
    pass


def read_yaml(path: Path) -> Any:
    with path.open(encoding="utf-8") as file:
        return yaml.safe_load(file) or {}


def parse(model: type[BaseModel], path: Path) -> Any:
    try:
        return model.model_validate(read_yaml(path))
    except ValidationError as error:
        lines = []
        for item in error.errors():
            location = ".".join(str(part) for part in item["loc"])
            lines.append(f"{location}: {item['msg']}")
        raise ContentError(f"{path.relative_to(CONTENT_DIR)}: " + "; ".join(lines)) from None
    except yaml.YAMLError as error:
        raise ContentError(f"{path.relative_to(CONTENT_DIR)}: ошибка YAML: {error}") from None


def item_ids(data: LessonData) -> list[str]:
    return [f"q/{q.id}" for q in data.questions] + [f"t/{t.id}" for t in data.tasks]


@dataclass
class CourseIndex:
    tree: dict
    errors: list[str] = field(default_factory=list)


_lock = threading.Lock()
_cache: tuple[tuple, CourseIndex] | None = None


def _signature() -> tuple:
    entries = []
    if CONTENT_DIR.exists():
        for path in CONTENT_DIR.rglob("*"):
            if path.is_file() and path.suffix in (".yaml", ".yml", ".md"):
                stat = path.stat()
                entries.append((str(path), stat.st_mtime_ns, stat.st_size))
    return tuple(sorted(entries))


def get_index() -> CourseIndex:
    global _cache
    signature = _signature()
    with _lock:
        if _cache is None or _cache[0] != signature:
            _cache = (signature, _build_index())
        return _cache[1]


def _build_index() -> CourseIndex:
    errors: list[str] = []
    parts = []
    if not CONTENT_DIR.exists():
        return CourseIndex(tree={"parts": []}, errors=[f"Папка контента не найдена: {CONTENT_DIR}"])

    for part_dir in sorted(p for p in CONTENT_DIR.iterdir() if p.is_dir() and PART_RE.match(p.name)):
        meta_path = part_dir / "part.yaml"
        try:
            meta = parse(PartMeta, meta_path) if meta_path.exists() else PartMeta(title=part_dir.name)
        except ContentError as error:
            errors.append(str(error))
            meta = PartMeta(title=part_dir.name)

        blocks = []
        for block_dir in sorted(b for b in part_dir.iterdir() if b.is_dir() and BLOCK_RE.match(b.name)):
            block = _index_block(part_dir.name, block_dir, errors)
            if block:
                blocks.append(block)

        project = None
        project_dir = part_dir / "project"
        if (project_dir / "project.yaml").exists():
            try:
                data: Project = parse(Project, project_dir / "project.yaml")
                project = {
                    "id": "project",
                    "title": data.title,
                    "mode": data.mode,
                    "stages": [
                        {"id": s.id, "title": s.title, "items": [f"t/{t.id}" for t in s.tasks] + (["check"] if s.criteria else [])}
                        for s in data.stages
                    ],
                }
            except ContentError as error:
                errors.append(str(error))

        parts.append(
            {
                "id": part_dir.name,
                "title": meta.title,
                "description": meta.description,
                "runtime": meta.runtime,
                "optional": meta.optional,
                "blocks": blocks,
                "project": project,
            }
        )
    return CourseIndex(tree={"parts": parts}, errors=errors)


def _index_block(part_id: str, block_dir: Path, errors: list[str]) -> dict | None:
    meta_path = block_dir / "block.yaml"
    if not meta_path.exists():
        errors.append(f"{part_id}/{block_dir.name}: нет block.yaml — блок пропущен")
        return None
    try:
        meta: BlockMeta = parse(BlockMeta, meta_path)
    except ContentError as error:
        errors.append(str(error))
        return None

    lessons = []
    for ref in meta.lessons:
        lesson_yaml = block_dir / f"{ref.id}.yaml"
        lesson_md = block_dir / f"{ref.id}.md"
        items: list[str] = []
        if not lesson_md.exists():
            errors.append(f"{part_id}/{block_dir.name}/{ref.id}.md: файл теории не найден")
        if lesson_yaml.exists():
            try:
                items = item_ids(parse(LessonData, lesson_yaml))
            except ContentError as error:
                errors.append(str(error))
        lessons.append({"id": ref.id, "title": ref.title, "items": items, "available": lesson_md.exists()})

    practicum = None
    practicum_path = block_dir / "practicum.yaml"
    if practicum_path.exists():
        try:
            data: Practicum = parse(Practicum, practicum_path)
            practicum = {"title": data.title, "items": item_ids(data), "pass_threshold": data.pass_threshold}
        except ContentError as error:
            errors.append(str(error))

    return {
        "id": block_dir.name,
        "title": meta.title,
        "description": meta.description,
        "mini_project": meta.mini_project,
        "lessons": lessons,
        "practicum": practicum,
        "has_cheatsheet": (block_dir / "cheatsheet.md").exists(),
    }


# ---------- выдача отдельных файлов ----------

def safe_dir(*parts: str) -> Path:
    path = CONTENT_DIR.joinpath(*parts).resolve()
    if CONTENT_DIR not in path.parents and path != CONTENT_DIR:
        raise ContentError("Недопустимый путь")
    return path


def load_lesson(part: str, block: str, lesson: str) -> dict:
    block_dir = safe_dir(part, block)
    meta: BlockMeta = parse(BlockMeta, block_dir / "block.yaml")
    ref = next((item for item in meta.lessons if item.id == lesson), None)
    if ref is None:
        raise FileNotFoundError(lesson)
    theory_path = block_dir / f"{lesson}.md"
    data_path = block_dir / f"{lesson}.yaml"
    theory = theory_path.read_text(encoding="utf-8") if theory_path.exists() else "_Теория этого урока ещё не добавлена._"
    data = parse(LessonData, data_path) if data_path.exists() else LessonData()
    return {"id": lesson, "title": ref.title, "theory": theory, **data.model_dump()}


def load_practicum(part: str, block: str) -> dict:
    path = safe_dir(part, block, "practicum.yaml")
    if not path.exists():
        raise FileNotFoundError(path)
    return parse(Practicum, path).model_dump()


def load_cheatsheet(part: str, block: str) -> str:
    path = safe_dir(part, block, "cheatsheet.md")
    if not path.exists():
        raise FileNotFoundError(path)
    return path.read_text(encoding="utf-8")


def load_project(part: str) -> dict:
    project_dir = safe_dir(part, "project")
    data: Project = parse(Project, project_dir / "project.yaml")
    solution_path = project_dir / "solution.md"
    solution = solution_path.read_text(encoding="utf-8") if solution_path.exists() else ""
    return {**data.model_dump(), "solution": solution}


def find_task(part: str, block: str, scope: str, task_id: str):
    """scope: lesson-NN | practicum | stage-id (для block == 'project')."""
    if block == "project":
        project: Project = parse(Project, safe_dir(part, "project", "project.yaml"))
        for stage in project.stages:
            if stage.id == scope:
                return next((t for t in stage.tasks if t.id == task_id), None)
        return None
    file = "practicum.yaml" if scope == "practicum" else f"{scope}.yaml"
    model = Practicum if scope == "practicum" else LessonData
    data = parse(model, safe_dir(part, block, file))
    return next((t for t in data.tasks if t.id == task_id), None)
