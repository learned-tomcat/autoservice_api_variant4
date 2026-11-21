"""Лабораторная работа, вариант 4: ровно 9 эндпоинтов REST API автосервиса."""

from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .database import Base, get_db, make_engine
from .models import Client, MaintenanceRecord, Service
from .schemas import (
    ClientCreate, ClientHistory, ClientPage, ClientRead, ClientUpdate,
    MaintenanceCreate, MaintenanceRead, ServiceCategory, ServiceCreate,
    ServicePage, ServiceRead,
)

SessionDep = Annotated[Session, Depends(get_db)]


def get_one(db: Session, model: type, obj_id: int, name: str):
    item = db.get(model, obj_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"{name} не найден(а)")
    return item


def commit_or_conflict(db: Session, message: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=message) from exc


def paginate(db: Session, stmt, page: int, page_size: int) -> dict:
    """Пагинация SQL-запроса после фильтрации, но до ограничения LIMIT/OFFSET."""
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.scalar(count_stmt) or 0
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


def to_record_read(record: MaintenanceRecord) -> MaintenanceRead:
    return MaintenanceRead(
        id=record.id,
        client_id=record.client_id,
        client_name=record.client.full_name,
        service_id=record.service_id,
        service_name=record.service.name,
        service_date=record.service_date,
        mileage_km=record.mileage_km,
        actual_price_rub=record.actual_price_rub,
        notes=record.notes,
    )


def create_app(database_url: str | None = None) -> FastAPI:
    engine = make_engine(database_url)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        Base.metadata.create_all(bind=engine)
        yield
        engine.dispose()

    app = FastAPI(
        title="Автосервис — REST API (вариант 4)",
        description="Учёт клиентов и услуг с сохранением истории обслуживания автомобилей.",
        version="1.0.0",
        lifespan=lifespan,
        openapi_tags=[
            {"name": "Клиенты", "description": "CRUD клиентов и поиск"},
            {"name": "Услуги", "description": "Каталог и фильтрация"},
            {"name": "Обслуживание", "description": "Регистрация работ и история клиента"},
        ],
    )
    # Лабораторная №2: разрешаем запросы из локального React/Vite-приложения.
    # Middleware не создаёт новых эндпоинтов; их по-прежнему ровно девять.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )
    app.state.engine = engine

    # 1. POST /clients — CREATE (клиенты)
    @app.post("/clients", response_model=ClientRead, status_code=status.HTTP_201_CREATED,
              tags=["Клиенты"], summary="Добавить клиента")
    def add_client(payload: ClientCreate, db: SessionDep):
        client = Client(**payload.model_dump())
        db.add(client)
        commit_or_conflict(db, "Автомобиль с таким госномером уже зарегистрирован")
        db.refresh(client)
        return client

    # 2. GET /clients — READ + поиск, сортировка, пагинация
    @app.get("/clients", response_model=ClientPage, tags=["Клиенты"],
             summary="Список и поиск клиентов")
    def list_clients(
        db: SessionDep,
        search: str | None = Query(default=None, min_length=1, max_length=100),
        sort_by: Literal["id", "full_name"] = "full_name",
        direction: Literal["asc", "desc"] = "asc",
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=10, ge=1, le=100),
    ):
        stmt = select(Client)
        if search:
            mask = f"%{search}%"
            stmt = stmt.where(Client.full_name.like(mask) | Client.phone.like(mask))
        column = getattr(Client, sort_by)
        stmt = stmt.order_by(column.desc() if direction == "desc" else column.asc(), Client.id.asc())
        return paginate(db, stmt, page, page_size)

    # 3. GET /clients/{client_id} — READ одного клиента
    @app.get("/clients/{client_id}", response_model=ClientRead, tags=["Клиенты"],
             summary="Получить клиента по ID")
    def get_client(client_id: int, db: SessionDep):
        return get_one(db, Client, client_id, "Клиент")

    # 4. PUT /clients/{client_id} — UPDATE
    @app.put("/clients/{client_id}", response_model=ClientRead, tags=["Клиенты"],
             summary="Обновить клиента")
    def update_client(client_id: int, payload: ClientUpdate, db: SessionDep):
        client = get_one(db, Client, client_id, "Клиент")
        for key, value in payload.model_dump().items():
            setattr(client, key, value)
        commit_or_conflict(db, "Автомобиль с таким госномером уже зарегистрирован")
        db.refresh(client)
        return client

    # 5. DELETE /clients/{client_id} — DELETE
    @app.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT,
                tags=["Клиенты"], summary="Удалить клиента без истории обслуживания")
    def delete_client(client_id: int, db: SessionDep):
        client = get_one(db, Client, client_id, "Клиент")
        has_records = db.scalar(
            select(MaintenanceRecord.id)
            .where(MaintenanceRecord.client_id == client_id)
            .limit(1)
        )
        if has_records is not None:
            raise HTTPException(status_code=409, detail="Нельзя удалить клиента с историей обслуживания")
        db.delete(client)
        commit_or_conflict(db, "Удаление нарушает целостность истории обслуживания")

    # 6. POST /services — создать услугу
    @app.post("/services", response_model=ServiceRead, status_code=status.HTTP_201_CREATED,
              tags=["Услуги"], summary="Добавить услугу")
    def add_service(payload: ServiceCreate, db: SessionDep):
        service = Service(**payload.model_dump(mode="json"))
        db.add(service)
        db.commit()
        db.refresh(service)
        return service

    # 7. GET /services — фильтрация по категории/цене + сортировка/пагинация
    @app.get("/services", response_model=ServicePage, tags=["Услуги"],
             summary="Получить каталог услуг с фильтрацией")
    def list_services(
        db: SessionDep,
        category: ServiceCategory | None = None,
        min_price: int | None = Query(default=None, ge=1),
        max_price: int | None = Query(default=None, ge=1),
        sort_by: Literal["id", "name", "price_rub"] = "name",
        direction: Literal["asc", "desc"] = "asc",
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=10, ge=1, le=100),
    ):
        if min_price is not None and max_price is not None and min_price > max_price:
            raise HTTPException(status_code=422, detail="min_price не может быть больше max_price")
        stmt = select(Service)
        if category is not None:
            stmt = stmt.where(Service.category == category.value)
        if min_price is not None:
            stmt = stmt.where(Service.price_rub >= min_price)
        if max_price is not None:
            stmt = stmt.where(Service.price_rub <= max_price)
        column = getattr(Service, sort_by)
        stmt = stmt.order_by(column.desc() if direction == "desc" else column.asc(), Service.id.asc())
        return paginate(db, stmt, page, page_size)

    # 8. POST /maintenance — зарегистрировать выполненную работу
    @app.post("/maintenance", response_model=MaintenanceRead,
              status_code=status.HTTP_201_CREATED, tags=["Обслуживание"],
              summary="Зарегистрировать обслуживание автомобиля")
    def add_maintenance(payload: MaintenanceCreate, db: SessionDep):
        get_one(db, Client, payload.client_id, "Клиент")
        service = get_one(db, Service, payload.service_id, "Услуга")
        data = payload.model_dump()
        if data["actual_price_rub"] is None:
            data["actual_price_rub"] = service.price_rub
        record = MaintenanceRecord(**data)
        db.add(record)
        db.commit()
        db.refresh(record)
        return to_record_read(record)

    # 9. GET /clients/{client_id}/history — история + агрегация затрат
    @app.get("/clients/{client_id}/history", response_model=ClientHistory,
             tags=["Обслуживание"], summary="История обслуживания и сумма затрат")
    def client_history(client_id: int, db: SessionDep):
        client = get_one(db, Client, client_id, "Клиент")
        records = db.scalars(
            select(MaintenanceRecord)
            .options(selectinload(MaintenanceRecord.client), selectinload(MaintenanceRecord.service))
            .where(MaintenanceRecord.client_id == client_id)
            .order_by(MaintenanceRecord.service_date.desc(), MaintenanceRecord.id.desc())
        ).all()
        return ClientHistory(
            client=ClientRead.model_validate(client),
            records=[to_record_read(item) for item in records],
            records_count=len(records),
            total_spent_rub=sum(item.actual_price_rub for item in records),
        )

    return app


app = create_app()
