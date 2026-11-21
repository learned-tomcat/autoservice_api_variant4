"""Тесты для девяти эндпоинтов лабораторной работы (вариант 4)."""

from datetime import date, timedelta


def test_openapi_has_exactly_nine_operations(api):
    assert api.get("/docs").status_code == 200
    assert api.get("/redoc").status_code == 200
    spec = api.get("/openapi.json").json()
    assert spec["info"]["title"].startswith("Автосервис")
    assert len(spec["paths"]) == 5
    assert sum(len(methods) for methods in spec["paths"].values()) == 9
    assert {"get", "post", "put", "delete"} <= {
        method for methods in spec["paths"].values() for method in methods
    }


def test_clients_crud(api, client_payload):
    created = api.post("/clients", json=client_payload)
    assert created.status_code == 201
    cid = created.json()["id"]
    assert created.json()["license_plate"] == "А123ВС77"
    assert api.get(f"/clients/{cid}").json()["full_name"] == "Иванов Иван Иванович"
    data = {**client_payload, "full_name": "Иванов Иван Петрович", "license_plate": "В333ВВ77"}
    updated = api.put(f"/clients/{cid}", json=data)
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Иванов Иван Петрович"
    assert api.delete(f"/clients/{cid}").status_code == 204
    assert api.get(f"/clients/{cid}").status_code == 404


def test_clients_search_sort_and_pagination(api, client_payload):
    for name, plate in [
        ("Петров Петр", "Т100ТТ77"),
        ("Иванов Иван", "Т200ТТ77"),
        ("Иванов Сергей", "Т300ТТ77"),
    ]:
        assert api.post("/clients", json={**client_payload, "full_name": name,
                                          "license_plate": plate}).status_code == 201
    data = api.get("/clients", params={"search": "Иванов", "sort_by": "full_name",
                                      "direction": "desc", "page_size": 1, "page": 2}).json()
    assert data["total"] == 2
    assert data["pages"] == 2
    assert data["items"][0]["full_name"] == "Иванов Иван"
    assert api.get("/clients", params={"search": "999123"}).json()["total"] == 3
    assert api.get("/clients", params={"page": 8}).json()["items"] == []


def test_service_catalog_filter_and_sort(api, service_payload):
    assert api.post("/services", json=service_payload).status_code == 201
    api.post("/services", json={"name": "Диагностика двигателя", "category": "Диагностика", "price_rub": 1400})
    api.post("/services", json={"name": "Замена масла АКПП", "category": "Техническое обслуживание", "price_rub": 6500})
    data = api.get("/services", params={"category": "Техническое обслуживание",
                                       "min_price": 2000, "max_price": 6000}).json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Замена масла"
    data = api.get("/services", params={"sort_by": "price_rub", "direction": "desc"}).json()
    assert [item["price_rub"] for item in data["items"]] == [6500, 2500, 1400]


def test_history_and_aggregate(api, populated):
    client, service = populated
    request = {"client_id": client["id"], "service_id": service["id"],
               "service_date": "2026-10-01", "mileage_km": 80200, "notes": "Замена фильтра"}
    first = api.post("/maintenance", json=request)
    assert first.status_code == 201
    assert first.json()["actual_price_rub"] == 2500
    assert first.json()["service_name"] == "Замена масла"
    second = api.post("/maintenance", json={**request, "service_date": "2026-09-01",
                                            "actual_price_rub": 1700})
    assert second.status_code == 201
    history = api.get(f"/clients/{client['id']}/history")
    assert history.status_code == 200
    data = history.json()
    assert data["records_count"] == 2
    assert data["total_spent_rub"] == 4200
    assert [x["service_date"] for x in data["records"]] == ["2026-10-01", "2026-09-01"]
    assert api.delete(f"/clients/{client['id']}").status_code == 409


def test_empty_history(api, populated):
    client, _ = populated
    history = api.get(f"/clients/{client['id']}/history").json()
    assert history["records_count"] == 0
    assert history["total_spent_rub"] == 0
    assert history["records"] == []


def test_duplicate_vehicle_plate(api, client_payload):
    assert api.post("/clients", json=client_payload).status_code == 201
    assert api.post("/clients", json=client_payload).status_code == 409


def test_validation_of_fields(api, client_payload, service_payload):
    assert api.post("/clients", json={**client_payload, "phone": "abc"}).status_code == 422
    assert api.post("/clients", json={**client_payload, "full_name": ""}).status_code == 422
    assert api.post("/clients", json={**client_payload, "extra": 1}).status_code == 422
    assert api.post("/services", json={**service_payload, "price_rub": -1}).status_code == 422
    assert api.post("/services", json={**service_payload, "category": "Другое"}).status_code == 422
    assert api.get("/clients", params={"page": 0}).status_code == 422
    assert api.get("/services", params={"page_size": 200}).status_code == 422
    assert api.get("/services", params={"min_price": 5000, "max_price": 1000}).status_code == 422
    assert api.get("/clients", params={"direction": "random"}).status_code == 422


def test_validation_future_maintenance(api, populated):
    client, service = populated
    future = (date.today() + timedelta(days=1)).isoformat()
    result = api.post("/maintenance", json={"client_id": client["id"],
                                            "service_id": service["id"],
                                            "service_date": future, "mileage_km": 1000})
    assert result.status_code == 422


def test_missing_client_service_and_history(api, populated):
    client, service = populated
    base = {"service_date": "2026-10-01", "mileage_km": 1000}
    assert api.post("/maintenance", json={**base, "client_id": 999,
                                          "service_id": service["id"]}).status_code == 404
    assert api.post("/maintenance", json={**base, "client_id": client["id"],
                                          "service_id": 999}).status_code == 404
    assert api.get("/clients/777/history").status_code == 404
    assert api.put("/clients/999", json={"full_name": "Иван Иванов", "phone": "+79991234567",
                                             "vehicle_brand": "Toyota", "vehicle_model": "Camry",
                                             "license_plate": "Т100ТТ77"}).status_code == 404
    assert api.delete("/clients/999").status_code == 404


def test_price_copy_is_immutable(api, populated):
    client, service = populated
    result = api.post("/maintenance", json={"client_id": client["id"],
                                             "service_id": service["id"],
                                             "service_date": "2026-10-01", "mileage_km": 1000})
    assert result.status_code == 201
    # Тариф — справочник. История сохраняет фактическую цену отдельным полем.
    assert result.json()["actual_price_rub"] == service["price_rub"]
    assert api.get(f"/clients/{client['id']}/history").json()["total_spent_rub"] == 2500


def test_react_cors_preflight(api):
    """React на 5173 может обращаться к FastAPI на 8000 без ошибок CORS."""
    response = api.options(
        "/clients",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "PUT" in response.headers["access-control-allow-methods"]
