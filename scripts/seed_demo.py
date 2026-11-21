"""Добавляет демонстрационные данные без очистки существующей базы.

Запуск из корня: python -m scripts.seed_demo
Не используйте в реальной базе, если демонстрационные данные не нужны.
"""
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import Base, make_engine
from app.models import Client, MaintenanceRecord, Service

CLIENTS = [
    ("Иванов Иван Иванович", "+79991234567", "Toyota", "Camry", "А123ВС77"),
    ("Петрова Анна Сергеевна", "+79876543210", "Kia", "Rio", "М456КМ77"),
    ("Смирнов Алексей Олегович", "+79035554433", "Volkswagen", "Polo", "Е789ЕЕ77"),
    ("Кузнецова Мария Андреевна", "+79261234567", "Hyundai", "Solaris", "К234МР77"),
]
SERVICES = [
    ("Замена масла", "Техническое обслуживание", 2500),
    ("Диагностика двигателя", "Диагностика", 1800),
    ("Замена тормозных колодок", "Ремонт", 4300),
    ("Шиномонтаж", "Шиномонтаж", 2200),
]

def main():
    engine = make_engine()
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for name, phone, brand, model, plate in CLIENTS:
            if not db.scalar(select(Client.id).where(Client.license_plate == plate)):
                db.add(Client(full_name=name, phone=phone, vehicle_brand=brand,
                              vehicle_model=model, license_plate=plate))
        for name, category, price in SERVICES:
            if not db.scalar(select(Service.id).where(Service.name == name)):
                db.add(Service(name=name, category=category, price_rub=price))
        db.commit()
        customer = db.scalar(select(Client).where(Client.license_plate == CLIENTS[0][4]))
        oil = db.scalar(select(Service).where(Service.name == SERVICES[0][0]))
        diag = db.scalar(select(Service).where(Service.name == SERVICES[1][0]))
        if customer and oil and diag and not db.scalar(select(MaintenanceRecord.id).where(MaintenanceRecord.client_id == customer.id)):
            db.add_all([
                MaintenanceRecord(client_id=customer.id, service_id=oil.id,
                                  service_date=date.today()-timedelta(days=20), mileage_km=80200,
                                  actual_price_rub=oil.price_rub, notes="Плановая замена масла и фильтра"),
                MaintenanceRecord(client_id=customer.id, service_id=diag.id,
                                  service_date=date.today()-timedelta(days=54), mileage_km=77500,
                                  actual_price_rub=diag.price_rub, notes="Компьютерная диагностика"),
            ])
        db.commit()
    engine.dispose()
    print("Демо-данные добавлены. Запустите API и React-приложение.")

if __name__ == '__main__': main()
