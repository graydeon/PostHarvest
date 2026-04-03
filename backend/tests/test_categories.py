def test_list_categories(client):
    resp = client.get("/api/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    names = [c["name"] for c in data]
    assert "Hook Style" in names
    assert "Content Type" in names
    assert "Industry" in names
    for cat in data:
        assert len(cat["values"]) > 0


def test_create_category(client):
    resp = client.post("/api/categories", json={"name": "Platform"})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Platform"
    assert resp.json()["values"] == []


def test_create_duplicate_category_rejected(client):
    resp = client.post("/api/categories", json={"name": "Hook Style"})
    assert resp.status_code == 409


def test_add_category_value(client):
    resp = client.get("/api/categories")
    cat_id = [c for c in resp.json() if c["name"] == "Hook Style"][0]["id"]
    resp = client.post(f"/api/categories/{cat_id}/values", json={"value": "Metaphor"})
    assert resp.status_code == 201
    assert resp.json()["value"] == "Metaphor"
