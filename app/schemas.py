"""Pydantic-схемы запросов и ответов с валидацией."""

from datetime import date
from enum import Enum
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ServiceCategory(str, Enum):
    diagnostics = "Диагностика"
    repair = "Ремонт"
    maintenance = "Техническое обслуживание"
    tires = "Шиномонтаж"


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class ClientBase(InputModel):
    full_name: str = Field(min_length=2, max_length=100, examples=["Иванов Иван Иванович"])
    phone: str = Field(min_length=10, max_length=20, examples=["+79991234567"])
    vehicle_brand: str = Field(min_length=2, max_length=50, examples=["Toyota"])
    vehicle_model: str = Field(min_length=1, max_length=50, examples=["Camry"])
    license_plate: str = Field(min_length=5, max_length=15, examples=["А123ВС77"])

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        if not re.fullmatch(r"\+?[0-9 ()-]+", value):
            raise ValueError("Телефон может содержать только цифры, +, пробелы, скобки и дефис")
        if not 10 <= sum(ch.isdigit() for ch in value) <= 15:
            raise ValueError("Телефон должен содержать от 10 до 15 цифр")
        return value

    @field_validator("license_plate")
    @classmethod
    def normalize_plate(cls, value: str) -> str:
        plate = value.upper()
        if not re.fullmatch(r"[A-ZА-ЯЁ0-9-]+", plate):
            raise ValueError("Некорректный госномер автомобиля")
        return plate


class ClientCreate(ClientBase):
    pass


class ClientUpdate(ClientBase):
    pass


class ClientRead(ClientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ServiceBase(InputModel):
    name: str = Field(min_length=2, max_length=100, examples=["Замена масла"])
    category: ServiceCategory
    price_rub: int = Field(gt=0, le=10_000_000, examples=[2500])


class ServiceCreate(ServiceBase):
    pass


class ServiceRead(ServiceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class MaintenanceBase(InputModel):
    client_id: int = Field(gt=0)
    service_id: int = Field(gt=0)
    service_date: date = Field(examples=["2026-11-10"])
    mileage_km: int = Field(ge=0, le=2_000_000, examples=[80000])
    actual_price_rub: int | None = Field(default=None, gt=0, le=10_000_000)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("service_date")
    @classmethod
    def no_future_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Дата выполненной работы не может быть в будущем")
        return value


class MaintenanceCreate(MaintenanceBase):
    pass


class MaintenanceRead(BaseModel):
    id: int
    client_id: int
    client_name: str
    service_id: int
    service_name: str
    service_date: date
    mileage_km: int
    actual_price_rub: int
    notes: str | None


class ClientPage(BaseModel):
    items: list[ClientRead]
    total: int
    page: int
    page_size: int
    pages: int


class ServicePage(BaseModel):
    items: list[ServiceRead]
    total: int
    page: int
    page_size: int
    pages: int


class ClientHistory(BaseModel):
    client: ClientRead
    records: list[MaintenanceRead]
    records_count: int
    total_spent_rub: int
