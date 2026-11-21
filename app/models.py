"""Реляционная модель данных: клиенты, услуги и история работ."""

from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    vehicle_brand: Mapped[str] = mapped_column(String(50), nullable=False)
    vehicle_model: Mapped[str] = mapped_column(String(50), nullable=False)
    license_plate: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=False)

    records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="client")


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    price_rub: Mapped[int] = mapped_column(Integer, nullable=False)

    records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="service")


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    mileage_km: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_price_rub: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    client: Mapped[Client] = relationship(back_populates="records")
    service: Mapped[Service] = relationship(back_populates="records")


Index("ix_maintenance_client_date", MaintenanceRecord.client_id, MaintenanceRecord.service_date)
