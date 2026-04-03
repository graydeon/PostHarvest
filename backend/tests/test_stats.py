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
