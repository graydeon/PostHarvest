import csv
import io


def test_export_csv_shape(client):
    client.post("/api/posts", json={
        "tweet_id": "ex1", "author_handle": "@csv_test", "author_name": "CSV Test",
        "text": "export this post", "url": "https://x.com/ex1",
        "likes": 100, "retweets": 20, "replies": 5, "views": 1000
    })
    r = client.get("/api/posts/export?format=csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert "attachment" in r.headers.get("content-disposition", "")
    reader = csv.DictReader(io.StringIO(r.text))
    rows = list(reader)
    assert len(rows) >= 1
    assert "id" in reader.fieldnames
    assert "text" in reader.fieldnames
    assert "author_handle" in reader.fieldnames
    assert "tags" in reader.fieldnames
    assert "categories" in reader.fieldnames
    assert "media_count" in reader.fieldnames


def test_export_json_shape(client):
    client.post("/api/posts", json={
        "tweet_id": "ex2", "author_handle": "@json_test", "author_name": "JSON Test",
        "text": "json export", "url": "https://x.com/ex2",
        "likes": 50, "retweets": 10, "replies": 2, "views": 500
    })
    r = client.get("/api/posts/export?format=json")
    assert r.status_code == 200
    assert "application/json" in r.headers["content-type"]
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "id" in data[0]
    assert "text" in data[0]
    assert "tags" in data[0]


def test_export_llm_shape(client):
    client.post("/api/posts", json={
        "tweet_id": "ex3", "author_handle": "@llm_test", "author_name": "LLM Test",
        "text": "llm export", "url": "https://x.com/ex3",
        "likes": 200, "retweets": 30, "replies": 8, "views": 2000
    })
    r = client.get("/api/posts/export?format=llm")
    assert r.status_code == 200
    data = r.json()
    assert "exported_at" in data
    assert "post_count" in data
    assert "filters_applied" in data
    assert "posts" in data
    assert data["post_count"] == len(data["posts"])
    post = data["posts"][0]
    assert "id" in post
    assert "text" in post
    assert "author" in post
    assert "metrics" in post
    assert "tags" in post
    assert "categories" in post
    assert "harvested_at" in post
    assert "media" not in post


def test_export_respects_filters(client):
    client.post("/api/posts", json={
        "tweet_id": "ef1", "author_handle": "@alice", "author_name": "Alice",
        "text": "alice post", "url": "https://x.com/ef1",
        "likes": 10, "retweets": 0, "replies": 0, "views": 0
    })
    client.post("/api/posts", json={
        "tweet_id": "ef2", "author_handle": "@bob", "author_name": "Bob",
        "text": "bob post", "url": "https://x.com/ef2",
        "likes": 10, "retweets": 0, "replies": 0, "views": 0
    })
    r = client.get("/api/posts/export?format=json&author=@alice")
    data = r.json()
    assert all(p["author_handle"] == "@alice" for p in data)
    assert len(data) == 1


def test_export_invalid_format(client):
    r = client.get("/api/posts/export?format=xlsx")
    assert r.status_code == 400
