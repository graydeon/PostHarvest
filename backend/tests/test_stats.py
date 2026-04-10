SAMPLE_POST = {
    "tweet_id": "1234567890",
    "author_handle": "@testuser",
    "author_name": "Test User",
    "text": "Test post",
    "url": "https://x.com/testuser/status/1234567890",
    "likes": 100,
    "retweets": 20,
    "views": 5000,
    "media_urls": [],
}


def test_stats_empty(client):
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_posts"] == 0


def test_stats_with_posts(client):
    client.post("/api/posts", json=SAMPLE_POST)
    second = {**SAMPLE_POST, "tweet_id": "999", "url": "https://x.com/t/status/999", "likes": 200, "views": 10000}
    client.post("/api/posts", json=second)
    resp = client.get("/api/stats")
    data = resp.json()
    assert data["total_posts"] == 2
    assert data["total_authors"] == 1
    assert data["avg_likes"] == 150.0
    assert data["avg_views"] == 7500.0
    assert len(data["top_authors"]) == 1
    assert data["top_authors"][0]["author_handle"] == "@testuser"
    assert data["top_authors"][0]["count"] == 2


def test_analytics_endpoint_shape(client):
    r = client.get("/api/stats/analytics")
    assert r.status_code == 200
    data = r.json()
    assert "engagement_by_hook" in data
    assert "content_type_mix" in data
    assert "industry_breakdown" in data
    assert "harvest_trend" in data
    assert isinstance(data["engagement_by_hook"], list)
    assert isinstance(data["content_type_mix"], list)
    assert isinstance(data["industry_breakdown"], list)
    assert isinstance(data["harvest_trend"], list)


def test_analytics_engagement_by_hook(client):
    r_cats = client.get("/api/categories")
    cats = r_cats.json()
    hook_cat = next(c for c in cats if c["name"] == "Hook Style")
    question_val = next(v for v in hook_cat["values"] if v["value"] == "Question")

    r_post = client.post("/api/posts", json={
        "tweet_id": "ah1", "author_handle": "@a", "author_name": "A",
        "text": "test", "url": "https://x.com/ah1",
        "likes": 500, "retweets": 0, "replies": 0, "views": 0
    })
    post_id = r_post.json()["id"]
    client.put(f"/api/posts/{post_id}", json={"category_value_ids": [question_val["id"]]})

    r = client.get("/api/stats/analytics")
    data = r.json()
    hook_data = {item["label"]: item["avg_likes"] for item in data["engagement_by_hook"]}
    assert "Question" in hook_data
    assert abs(hook_data["Question"] - 500.0) < 0.1


def test_analytics_harvest_trend(client):
    client.post("/api/posts", json={
        "tweet_id": "ht1", "author_handle": "@a", "author_name": "A",
        "text": "trend test", "url": "https://x.com/ht1",
        "likes": 0, "retweets": 0, "replies": 0, "views": 0
    })
    r = client.get("/api/stats/analytics")
    data = r.json()
    assert len(data["harvest_trend"]) >= 1
    entry = data["harvest_trend"][0]
    assert "date" in entry
    assert "count" in entry
