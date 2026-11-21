"""Изоляция тестов: каждому тесту выделяется отдельная SQLite-база."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def api(tmp_path):
    url = f"sqlite:///{tmp_path / 'test_autoservice.db'}"
    with TestClient(create_app(url)) as client:
        yield client


@pytest.fixture
def client_payload():
    return {
        "full_name": "Иванов Иван Иванович", "phone": "+79991234567",
        "vehicle_brand": "Toyota", "vehicle_model": "Camry", "license_plate": "а123вс77",
    }


@pytest.fixture
def service_payload():
    return {"name": "Замена масла", "category": "Техническое обслуживание", "price_rub": 2500}


@pytest.fixture
def populated(api, client_payload, service_payload):
    client = api.post("/clients", json=client_payload).json()
    service = api.post("/services", json=service_payload).json()
    return client, service
