SAMPLE_POST = {
    "tweet_id": "1234567890",
    "author_handle": "@testuser",
    "author_name": "Test User",
    "text": "This is a great marketing thread about SaaS pricing.",
    "url": "https://x.com/testuser/status/1234567890",
    "posted_at": "2026-03-15T10:30:00Z",
    "likes": 1500,
    "retweets": 320,
    "replies": 45,
    "views": 50000,
    "media_urls": [],
}


def test_create_post(client):
    resp = client.post("/api/posts", json=SAMPLE_POST)
    assert resp.status_code == 201
    data = resp.json()
    assert data["tweet_id"] == "1234567890"
    assert data["author_handle"] == "@testuser"
    assert data["likes"] == 1500
    assert data["id"] is not None


def test_create_duplicate_post_rejected(client):
    client.post("/api/posts", json=SAMPLE_POST)
    resp = client.post("/api/posts", json=SAMPLE_POST)
    assert resp.status_code == 409


def test_get_post_by_id(client):
    create_resp = client.post("/api/posts", json=SAMPLE_POST)
    post_id = create_resp.json()["id"]
    resp = client.get(f"/api/posts/{post_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == SAMPLE_POST["text"]
    assert data["media"] == []
    assert data["tags"] == []
    assert data["categories"] == []


def test_get_nonexistent_post_404(client):
    resp = client.get("/api/posts/9999")
    assert resp.status_code == 404


def test_list_posts(client):
    client.post("/api/posts", json=SAMPLE_POST)
    second = {**SAMPLE_POST, "tweet_id": "9999", "url": "https://x.com/testuser/status/9999"}
    client.post("/api/posts", json=second)
    resp = client.get("/api/posts")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["posts"]) == 2


def test_list_posts_filter_by_author(client):
    client.post("/api/posts", json=SAMPLE_POST)
    other = {**SAMPLE_POST, "tweet_id": "9999", "url": "https://x.com/other/status/9999", "author_handle": "@other"}
    client.post("/api/posts", json=other)
    resp = client.get("/api/posts", params={"author": "@testuser"})
    data = resp.json()
    assert data["total"] == 1
    assert data["posts"][0]["author_handle"] == "@testuser"


def test_list_posts_search_text(client):
    client.post("/api/posts", json=SAMPLE_POST)
    other = {**SAMPLE_POST, "tweet_id": "9999", "url": "https://x.com/t/status/9999", "text": "Unrelated content"}
    client.post("/api/posts", json=other)
    resp = client.get("/api/posts", params={"q": "SaaS pricing"})
    data = resp.json()
    assert data["total"] == 1


def test_update_post_notes(client):
    create_resp = client.post("/api/posts", json=SAMPLE_POST)
    post_id = create_resp.json()["id"]
    resp = client.put(f"/api/posts/{post_id}", json={"notes": "Great hook example"})
    assert resp.status_code == 200
    assert resp.json()["notes"] == "Great hook example"


def test_update_post_tags(client):
    create_resp = client.post("/api/posts", json=SAMPLE_POST)
    post_id = create_resp.json()["id"]
    resp = client.put(f"/api/posts/{post_id}", json={"tags": ["viral", "saas"]})
    assert resp.status_code == 200
    tags = [t["tag"] for t in resp.json()["tags"]]
    assert "viral" in tags
    assert "saas" in tags


def test_update_post_categories(client):
    create_resp = client.post("/api/posts", json=SAMPLE_POST)
    post_id = create_resp.json()["id"]
    cats_resp = client.get("/api/categories")
    cat_value_id = cats_resp.json()[0]["values"][0]["id"]
    resp = client.put(f"/api/posts/{post_id}", json={"category_value_ids": [cat_value_id]})
    assert resp.status_code == 200
    assert len(resp.json()["categories"]) == 1


def test_delete_post(client):
    create_resp = client.post("/api/posts", json=SAMPLE_POST)
    post_id = create_resp.json()["id"]
    resp = client.delete(f"/api/posts/{post_id}")
    assert resp.status_code == 204
    resp = client.get(f"/api/posts/{post_id}")
    assert resp.status_code == 404
