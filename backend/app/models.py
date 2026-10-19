from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    progress: Mapped[list["ProgressItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class ProgressItem(Base):
    """Одна единица прогресса: ответ на вопрос, решение задачи, посещение урока.

    key — путь элемента, например «part-01/block-01/lesson-01/q/q1».
    data — состояние в JSON (статус, попытки, последний код и т.д.), формат задаёт фронтенд.
    """

    __tablename__ = "progress_items"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_progress_user_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(400))
    data: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="progress")
