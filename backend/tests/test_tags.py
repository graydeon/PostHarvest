SAMPLE_POST = {
    "tweet_id": "1234567890",
    "author_handle": "@testuser",
    "author_name": "Test User",
    "text": "Test post",
    "url": "https://x.com/testuser/status/1234567890",
    "media_urls": [],
}


def test_list_tags_empty(client):
    resp = client.get("/api/tags")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_tags_after_tagging(client):
    create_resp = client.post("/api/posts", json=SAMPLE_POST)
    post_id = create_resp.json()["id"]
    client.put(f"/api/posts/{post_id}", json={"tags": ["viral", "hook"]})
    resp = client.get("/api/tags")
    assert resp.status_code == 200
    tags = resp.json()
    assert "viral" in tags
    assert "hook" in tags
