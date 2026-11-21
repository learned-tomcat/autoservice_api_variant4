"""Подключение к SQLite и выдача отдельной сессии на HTTP-запрос."""

from collections.abc import Generator
import os

from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session


class Base(DeclarativeBase):
    """Базовый класс ORM-моделей."""


def make_engine(database_url: str | None = None):
    url = database_url or os.getenv("DATABASE_URL", "sqlite:///./autoservice.db")
    if url.startswith("sqlite"):
        # SQLite поддерживает внешние ключи только при включённом PRAGMA.
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    raise ValueError("В лабораторной работе поддерживается SQLite (sqlite:///...).")


def get_db(request: Request) -> Generator[Session, None, None]:
    with Session(request.app.state.engine) as session:
        yield session
