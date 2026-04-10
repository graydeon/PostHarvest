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


def test_search_by_author_handle(client):
    client.post("/api/posts", json={
        "tweet_id": "s1", "author_handle": "@findme", "author_name": "Test",
        "text": "nothing special here", "url": "https://x.com/s1",
        "likes": 0, "retweets": 0, "replies": 0, "views": 0
    })
    r = client.get("/api/posts?q=findme")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["posts"][0]["author_handle"] == "@findme"


def test_search_by_tag(client):
    r_post = client.post("/api/posts", json={
        "tweet_id": "s2", "author_handle": "@other", "author_name": "Other",
        "text": "generic text", "url": "https://x.com/s2",
        "likes": 0, "retweets": 0, "replies": 0, "views": 0
    })
    post_id = r_post.json()["id"]
    client.put(f"/api/posts/{post_id}", json={"tags": ["growthhack"]})
    r = client.get("/api/posts?q=growthhack")
    assert r.status_code == 200
    assert r.json()["total"] == 1


def test_date_range_filter(client):
    client.post("/api/posts", json={
        "tweet_id": "d1", "author_handle": "@a", "author_name": "A",
        "text": "old", "url": "https://x.com/d1",
        "likes": 0, "retweets": 0, "replies": 0, "views": 0
    })
    r = client.get("/api/posts?date_from=2099-01-01&date_to=2099-12-31")
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_pagination_offset(client):
    for i in range(5):
        client.post("/api/posts", json={
            "tweet_id": f"p{i}", "author_handle": "@a", "author_name": "A",
            "text": f"post {i}", "url": f"https://x.com/p{i}",
            "likes": 0, "retweets": 0, "replies": 0, "views": 0
        })
    r = client.get("/api/posts?limit=3&offset=0")
    assert r.status_code == 200
    data = r.json()
    assert len(data["posts"]) == 3
    assert data["total"] == 5
    r2 = client.get("/api/posts?limit=3&offset=3")
    assert r2.json()["total"] == 5
    assert len(r2.json()["posts"]) == 2


def test_multi_category_filter(client):
    r_cats = client.get("/api/categories")
    cats = r_cats.json()
    hook_cat = next(c for c in cats if c["name"] == "Hook Style")
    question_val = next(v for v in hook_cat["values"] if v["value"] == "Question")

    r_post = client.post("/api/posts", json={
        "tweet_id": "mc1", "author_handle": "@a", "author_name": "A",
        "text": "test", "url": "https://x.com/mc1",
        "likes": 0, "retweets": 0, "replies": 0, "views": 0
    })
    post_id = r_post.json()["id"]
    client.put(f"/api/posts/{post_id}", json={"category_value_ids": [question_val["id"]]})

    r = client.get(f"/api/posts?category_value_id={question_val['id']}")
    assert r.status_code == 200
    assert r.json()["total"] == 1
