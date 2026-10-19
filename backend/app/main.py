import io
import mimetypes
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import content
from .auth import get_current_user
from .auth import router as auth_router
from .config import CONTENT_DIR, CORS_ORIGINS, FRONTEND_DIST
from .db import get_db, init_db
from .models import ProgressItem, User

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Python → AI Engineer", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)


def _not_found(what: str) -> HTTPException:
    return HTTPException(404, f"{what} не найден(а)")


def _content_call(func, *args):
    try:
        return func(*args)
    except FileNotFoundError:
        raise _not_found("Материал")
    except content.ContentError as error:
        raise HTTPException(422, f"Ошибка в файлах контента: {error}")


# ---------- контент ----------

@app.get("/api/course")
def get_course() -> dict:
    index = content.get_index()
    return {**index.tree, "errors": index.errors}


@app.get("/api/content/{part}/{block}/lessons/{lesson}")
def get_lesson(part: str, block: str, lesson: str) -> dict:
    return _content_call(content.load_lesson, part, block, lesson)


@app.get("/api/content/{part}/{block}/practicum")
def get_practicum(part: str, block: str) -> dict:
    return _content_call(content.load_practicum, part, block)


@app.get("/api/content/{part}/{block}/cheatsheet", response_class=PlainTextResponse)
def get_cheatsheet(part: str, block: str) -> str:
    return _content_call(content.load_cheatsheet, part, block)


@app.get("/api/content/{part}/project")
def get_project(part: str) -> dict:
    return _content_call(content.load_project, part)


@app.get("/api/assets/{path:path}")
def get_asset(path: str) -> FileResponse:
    try:
        file_path = content.safe_dir(*path.split("/"))
    except content.ContentError:
        raise _not_found("Файл")
    if not file_path.is_file() or file_path.suffix in (".yaml", ".yml"):
        raise _not_found("Файл")
    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    return FileResponse(file_path, media_type=media_type)


@app.get("/api/download/{part}/{block}/{scope}/{task_id}.zip")
def download_task(part: str, block: str, scope: str, task_id: str) -> Response:
    """ZIP с заготовкой local-задания: файлы проекта + README с условием."""
    task = _content_call(content.find_task, part, block, scope, task_id)
    if task is None:
        raise _not_found("Задание")
    buffer = io.BytesIO()
    folder = f"{part}-{block}-{scope}-{task_id}"
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        readme = f"# {task.title}\n\n{task.statement}\n\n## Как проверить\n\n```bash\n{task.run}\n```\n"
        # Если в задании есть свой README.md (README проекта), условие кладём в TASK.md
        readme_name = "TASK.md" if "README.md" in task.files else "README.md"
        archive.writestr(f"{folder}/{readme_name}", readme)
        for name, text in task.files.items():
            archive.writestr(f"{folder}/{name}", text)
        block_dir = CONTENT_DIR / part / block
        for asset in task.assets:
            asset_path = (block_dir / asset).resolve()
            if asset_path.is_file() and CONTENT_DIR in asset_path.parents:
                archive.write(asset_path, f"{folder}/{asset}")
    return Response(
        buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{folder}.zip"'},
    )


# ---------- прогресс ----------

class ProgressIn(BaseModel):
    key: str = Field(max_length=400)
    data: dict


class ProgressBatch(BaseModel):
    items: list[ProgressIn] = Field(max_length=2000)


@app.get("/api/progress")
def get_progress(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(ProgressItem).where(ProgressItem.user_id == user.id)).all()
    return {"items": {row.key: row.data for row in rows}}


@app.put("/api/progress")
def put_progress(
    batch: ProgressBatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    keys = [item.key for item in batch.items]
    existing = {
        row.key: row
        for row in db.scalars(
            select(ProgressItem).where(ProgressItem.user_id == user.id, ProgressItem.key.in_(keys))
        )
    }
    for item in batch.items:
        row = existing.get(item.key)
        if row is None:
            db.add(ProgressItem(user_id=user.id, key=item.key, data=item.data))
        else:
            row.data = item.data
            row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"saved": len(batch.items)}


@app.delete("/api/progress")
def delete_progress(
    prefix: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Сброс прогресса по префиксу ключа (например, повтор практикума)."""
    result = db.execute(
        delete(ProgressItem).where(ProgressItem.user_id == user.id, ProgressItem.key.startswith(prefix))
    )
    db.commit()
    return {"deleted": result.rowcount}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# ---------- собранный фронтенд ----------

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file() and FRONTEND_DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
