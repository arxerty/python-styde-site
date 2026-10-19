"""Настройки приложения. Всё читается из переменных окружения или файла backend/.env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")

# Папка с контентом курса (content/part-XX/block-YY/...)
CONTENT_DIR = Path(os.getenv("CONTENT_DIR", PROJECT_ROOT / "content")).resolve()

# PostgreSQL в продакшне: postgresql+psycopg://user:pass@localhost:5432/course
# Если переменная не задана — локальная SQLite, чтобы платформа запускалась без установки БД.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'dev.db'}")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me-in-production")
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "720"))

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

# Собранный фронтенд (npm run build) — бэкенд раздаёт его сам, если папка существует
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
