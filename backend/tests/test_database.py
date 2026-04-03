import pytest


def test_schema_creates_all_tables(db_conn):
    cursor = db_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    tables = [row[0] for row in cursor.fetchall()]
    assert "posts" in tables
    assert "media" in tables
    assert "categories" in tables
    assert "category_values" in tables
    assert "post_categories" in tables
    assert "tags" in tables


def test_default_categories_seeded(db_conn):
    cursor = db_conn.execute("SELECT name FROM categories ORDER BY name")
    names = [row[0] for row in cursor.fetchall()]
    assert "Hook Style" in names
    assert "Content Type" in names
    assert "Industry" in names


def test_hook_style_values_seeded(db_conn):
    cursor = db_conn.execute(
        """
        SELECT cv.value FROM category_values cv
        JOIN categories c ON cv.category_id = c.id
        WHERE c.name = 'Hook Style'
        ORDER BY cv.value
        """
    )
    values = [row[0] for row in cursor.fetchall()]
    assert "Bold Claim" in values
    assert "Question" in values
    assert "Story" in values
    assert "Statistic" in values
    assert "Contrarian" in values


def test_tweet_id_unique_constraint(db_conn):
    import sqlite3

    db_conn.execute(
        """
        INSERT INTO posts (tweet_id, author_handle, author_name, text, url, saved_at)
        VALUES ('123', '@test', 'Test', 'hello', 'https://x.com/test/status/123', datetime('now'))
        """
    )
    db_conn.commit()
    with pytest.raises(sqlite3.IntegrityError):
        db_conn.execute(
            """
            INSERT INTO posts (tweet_id, author_handle, author_name, text, url, saved_at)
            VALUES ('123', '@test', 'Test', 'hello', 'https://x.com/test/status/123', datetime('now'))
            """
        )
