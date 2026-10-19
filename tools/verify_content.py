"""Проверка контента курса.

    backend\\.venv\\Scripts\\python tools\\verify_content.py                 # весь курс
    backend\\.venv\\Scripts\\python tools\\verify_content.py part-01/block-02  # один блок или часть
    ... --local    # дополнительно запустить pytest для local-заданий (нужны пакеты задания)
    ... --quiet    # только ошибки

Что проверяется:
  * все YAML соответствуют схеме (backend/app/schema.py);
  * эталонное решение каждой browser-задачи проходит все её тесты;
  * заготовка (starter) НЕ проходит тесты — иначе задача решена заранее;
  * в вопросах «что выведет код?» правильный вариант совпадает с реальным выводом;
  * объём теории и количество вопросов/задач/тестов/подсказок (предупреждения).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import content as content_module  # noqa: E402
from app.schema import BlockMeta, LessonData, Practicum, Project, Task  # noqa: E402

CONTENT = ROOT / "content"
RUNNER = ROOT / "frontend" / "public" / "py" / "runner.py"
WORKER = ROOT / "tools" / "_task_worker.py"


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checked_tasks: int = 0
    checked_questions: int = 0

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"[ОШИБКА] {where}: {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"[предупр.] {where}: {message}")


def run_job(kind: str, payload: dict, assets_dir: Path | None, assets: list[str], timeout: float) -> dict:
    job = {"runner": str(RUNNER), "kind": kind, "payload": payload, "assets_dir": str(assets_dir) if assets_dir else None, "assets": assets}
    try:
        completed = subprocess.run(
            [sys.executable, "-I", str(WORKER)],
            input=json.dumps(job),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"passed": False, "results": [], "error": f"таймаут {timeout:.0f} с", "stdout": ""}
    if completed.returncode != 0 or not (completed.stdout or "").strip():
        return {"passed": False, "results": [], "error": "сбой процесса: " + (completed.stderr or "")[-1500:], "stdout": ""}
    return json.loads(completed.stdout)


def task_payload(task: Task, code: str) -> dict:
    return {
        "code": code,
        "tests": [test.model_dump(exclude_none=True) for test in task.tests],
        "setup": task.setup,
        "files": task.files,
        "constraints": task.constraints.model_dump() if task.constraints else None,
    }


def check_task(task: Task, where: str, assets_dir: Path, report: Report, lesson_like: bool) -> None:
    where = f"{where} задача {task.id}"
    if len(task.hints) < 2:
        report.warn(where, f"подсказок {len(task.hints)}, нужно 2")
    if task.mode == "local":
        return
    if lesson_like and len(task.tests) < 5:
        report.warn(where, f"тестов {len(task.tests)}, нужно минимум 5")
    timeout = task.timeout * max(1, len(task.tests)) + 30
    result = run_job("test", task_payload(task, task.solution), assets_dir, task.assets, timeout)
    report.checked_tasks += 1
    if not result.get("passed"):
        failed = [r for r in result.get("results", []) if not r["passed"]]
        detail = result.get("error") or "; ".join(f"«{r['name']}»: {r['message'][:400]}" for r in failed[:3])
        report.error(where, f"эталонное решение не проходит тесты: {detail}")
    if task.starter.strip():
        # на сайте у каждого теста свой таймаут: медленная заготовка должна упасть и здесь
        starter_timeout = task.timeout * max(1, len(task.tests)) + 5
        starter_result = run_job("test", task_payload(task, task.starter), assets_dir, task.assets, starter_timeout)
        if starter_result.get("passed"):
            report.error(where, "заготовка проходит все тесты — задача решена заранее")


def normalize(text: str) -> str:
    text = text.strip()
    fence = re.match(r"^```[a-z]*\n(.*)\n```$", text, re.S)
    if fence:
        text = fence.group(1)
    elif text.startswith("`") and text.endswith("`") and text.count("`") == 2:
        text = text[1:-1]
    return "\n".join(line.rstrip() for line in text.strip().splitlines())


def check_question(question, where: str, report: Report) -> None:
    where = f"{where} вопрос {question.id}"
    if "\n" in question.answer.strip():
        report.error(where, "текстовый ответ многострочный — его нельзя ввести в поле; используйте options")
    if question.options:
        for option in question.options:
            if not option.why.strip():
                report.warn(where, "у варианта нет пояснения why")
                break
    if question.type != "output":
        return
    result = run_job("run", {"code": question.code}, None, [], 30)
    report.checked_questions += 1
    actual = normalize(result.get("stdout", ""))
    if result.get("error"):
        error_type = result["error"].split("(")[0].split(":")[0].strip()
        actual = (actual + "\n" if actual else "") + f"<ошибка {error_type}>"
    if question.options:
        correct = next(option for option in question.options if option.correct)
        expected = normalize(correct.text)
    else:
        expected = normalize(question.answer)
    if result.get("error"):
        # Вопрос про ошибку: правильный вариант должен её упоминать
        error_type = result["error"].split("(")[0].split(":")[0].strip()
        if error_type not in expected and "ошибк" not in expected.lower():
            report.error(where, f"код падает с {error_type}, а правильный ответ: {expected!r}")
        return
    if actual != expected:
        report.error(where, f"правильный ответ {expected!r}, а код выводит {actual!r}")
    for option in question.options:
        if not option.correct and normalize(option.text) == actual:
            report.error(where, "неправильный вариант совпадает с реальным выводом")


def count_words(markdown: str) -> tuple[int, int]:
    """(всего слов вместе с примерами кода, слов в тексте без кода)."""
    word = r"[A-Za-zА-Яа-яЁё0-9_]+"
    without_code = re.sub(r"```.*?```", " ", markdown, flags=re.S)
    return len(re.findall(word, markdown)), len(re.findall(word, without_code))


CODE_BLOCK_RE = re.compile(r"```([^\n`]*)\n(.*?)```", re.S)


def check_theory_examples(text: str, where: str, report: Report) -> None:
    """Пример ```python, за которым сразу идёт ```text, должен выводить ровно этот текст."""
    blocks = [(m.group(1).strip(), m.group(2), m.start(), m.end()) for m in CODE_BLOCK_RE.finditer(text)]
    for (info, code, _, end), (next_info, next_code, next_start, _) in zip(blocks, blocks[1:]):
        if not info.startswith("python") or "norun" in info or next_info != "text":
            continue
        if text[end:next_start].strip():
            continue  # между кодом и выводом есть текст — это не пара «код → вывод»
        if "input(" in code:
            continue
        result = run_job("run", {"code": code}, None, [], 60)
        actual = normalize(result.get("stdout", ""))
        if result.get("error"):
            report.error(where, f"пример падает с ошибкой, но показан вывод:\n{code.strip()[:200]}\n→ {result['error'][:200]}")
            continue
        expected = normalize(next_code)
        if actual != expected:
            report.error(where, f"вывод примера не совпадает:\n{code.strip()[:300]}\nожидается в тексте: {expected[:300]!r}\nреально: {actual[:300]!r}")


def check_lesson_data(data: LessonData, where: str, assets_dir: Path, report: Report, jobs: list, is_practicum: bool) -> None:
    for question in data.questions:
        jobs.append((check_question, question, where, report))
    for task in data.tasks:
        jobs.append((check_task, task, where, assets_dir, report, not is_practicum))


def check_block(block_dir: Path, report: Report, jobs: list) -> None:
    where = str(block_dir.relative_to(CONTENT)).replace("\\", "/")
    try:
        meta: BlockMeta = content_module.parse(BlockMeta, block_dir / "block.yaml")
    except content_module.ContentError as error:
        report.error(where, str(error))
        return
    for lesson in meta.lessons:
        lesson_where = f"{where}/{lesson.id}"
        md = block_dir / f"{lesson.id}.md"
        if not md.exists():
            report.error(lesson_where, "нет файла теории .md")
        else:
            text = md.read_text(encoding="utf-8")
            total_words, prose_words = count_words(text)
            if total_words < 1500 or prose_words < 1000:
                report.warn(lesson_where, f"теория короткая: ~{total_words} слов (без кода ~{prose_words})")
            for section in ("Частые ошибки", "Где это в AI"):
                if section not in text:
                    report.warn(lesson_where, f"нет раздела «{section}…»")
            jobs.append((check_theory_examples, text, lesson_where, report))
        yaml_path = block_dir / f"{lesson.id}.yaml"
        if not yaml_path.exists():
            report.error(lesson_where, "нет файла вопросов/задач .yaml")
            continue
        try:
            data: LessonData = content_module.parse(LessonData, yaml_path)
        except content_module.ContentError as error:
            report.error(lesson_where, str(error))
            continue
        if not 5 <= len(data.questions) <= 6:
            report.warn(lesson_where, f"вопросов {len(data.questions)}, нужно 5–6")
        if not 3 <= len(data.tasks) <= 4:
            report.warn(lesson_where, f"задач {len(data.tasks)}, нужно 3–4")
        types = {q.type for q in data.questions}
        if len(types) < 3:
            report.warn(lesson_where, f"мало типов вопросов: {sorted(types)}")
        check_lesson_data(data, lesson_where, block_dir, report, jobs, False)

    practicum_path = block_dir / "practicum.yaml"
    if not practicum_path.exists():
        report.error(where, "нет practicum.yaml")
    else:
        try:
            practicum: Practicum = content_module.parse(Practicum, practicum_path)
            if not 12 <= len(practicum.questions) <= 15:
                report.warn(f"{where}/practicum", f"вопросов {len(practicum.questions)}, нужно 12–15")
            if not 4 <= len(practicum.tasks) <= 6:
                report.warn(f"{where}/practicum", f"задач {len(practicum.tasks)}, нужно 4–6")
            if practicum.tasks and not practicum.tasks[-1].mini_project:
                report.warn(f"{where}/practicum", "последняя задача не помечена mini_project: true")
            check_lesson_data(practicum, f"{where}/practicum", block_dir, report, jobs, True)
        except content_module.ContentError as error:
            report.error(where, str(error))
    if not (block_dir / "cheatsheet.md").exists():
        report.error(where, "нет cheatsheet.md")


def check_project(project_dir: Path, report: Report, jobs: list) -> None:
    where = str(project_dir.relative_to(CONTENT)).replace("\\", "/")
    try:
        project: Project = content_module.parse(Project, project_dir / "project.yaml")
    except content_module.ContentError as error:
        report.error(where, str(error))
        return
    if not (project_dir / "solution.md").exists():
        report.error(where, "нет solution.md")
    for stage in project.stages:
        for task in stage.tasks:
            jobs.append((check_task, task, f"{where}/{stage.id}", project_dir, report, False))


def check_local_task(task: Task, where: str, assets_dir: Path, report: Report) -> None:
    workdir = Path(tempfile.mkdtemp(prefix="local-"))
    try:
        for name, text in {**task.files, **task.solution_files}.items():
            path = workdir / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        for asset in task.assets:
            target = workdir / asset
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(assets_dir / asset, target)
        command = task.run.split()
        if command[0] == "pytest":
            command = [sys.executable, "-m", "pytest", *command[1:]]
        completed = subprocess.run(command, cwd=workdir, capture_output=True, text=True, timeout=600)
        tail = (completed.stdout + completed.stderr)[-800:]
        if completed.returncode == 0:
            return
        if "ModuleNotFoundError" in tail or "ImportError" in tail:
            report.warn(f"{where} задача {task.id}", "пропущено: нет пакетов для local-теста")
        else:
            report.error(f"{where} задача {task.id}", f"эталон local-задания не проходит тесты:\n{tail}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("target", nargs="?", default="", help="part-01 или part-01/block-02")
    parser.add_argument("--local", action="store_true", help="запускать pytest для local-заданий")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    report = Report()
    jobs: list = []
    base = CONTENT / args.target if args.target else CONTENT
    if not base.exists():
        print(f"Не найдено: {base}")
        return 2

    if (base / "block.yaml").exists():
        check_block(base, report, jobs)
    elif (base / "project.yaml").exists():
        check_project(base, report, jobs)
    else:
        part_dirs = [base] if base.name.startswith("part-") else sorted(base.glob("part-*"))
        for part_dir in part_dirs:
            for block_dir in sorted(part_dir.glob("block-*")):
                check_block(block_dir, report, jobs)
            if (part_dir / "project" / "project.yaml").exists():
                check_project(part_dir / "project", report, jobs)

    if args.local:
        for job in list(jobs):
            if job[0] is check_task and job[1].mode == "local":
                jobs.append((check_local_task, job[1], job[2], job[3], report))

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for future in [pool.submit(func, *job_args) for func, *job_args in jobs]:
            future.result()

    if not args.quiet:
        for line in report.warnings:
            print(line)
    for line in report.errors:
        print(line)
    print(
        f"\nПроверено задач: {report.checked_tasks}, вопросов с выводом: {report.checked_questions}. "
        f"Ошибок: {len(report.errors)}, предупреждений: {len(report.warnings)}"
    )
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
