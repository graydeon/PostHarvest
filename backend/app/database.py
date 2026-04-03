import sqlite3
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT UNIQUE NOT NULL,
    author_handle TEXT NOT NULL,
    author_name TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    posted_at TEXT,
    saved_at TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    retweets INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    original_url TEXT NOT NULL,
    local_path TEXT DEFAULT '',
    filename TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS category_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    UNIQUE(category_id, value)
);

CREATE TABLE IF NOT EXISTS post_categories (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    category_value_id INTEGER NOT NULL REFERENCES category_values(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, category_value_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    UNIQUE(post_id, tag)
);
"""

_DEFAULT_CATEGORIES = {
    "Hook Style": ["Question", "Bold Claim", "Story", "Statistic", "Contrarian"],
    "Content Type": ["Product Launch", "Thread", "Tutorial", "Case Study", "Meme", "Hot Take"],
    "Industry": ["SaaS", "E-commerce", "Creator Economy", "Finance", "Health/Fitness", "General"],
}


def init_db(db_path: str) -> sqlite3.Connection:
    """Initialize the database: create tables and seed default categories."""
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_SCHEMA)

    cursor = conn.execute("SELECT COUNT(*) FROM categories")
    if cursor.fetchone()[0] == 0:
        for cat_name, values in _DEFAULT_CATEGORIES.items():
            conn.execute("INSERT INTO categories (name) VALUES (?)", (cat_name,))
            cat_id = conn.execute(
                "SELECT id FROM categories WHERE name = ?", (cat_name,)
            ).fetchone()[0]
            for val in values:
                conn.execute(
                    "INSERT INTO category_values (category_id, value) VALUES (?, ?)",
                    (cat_id, val),
                )
    conn.commit()
    return conn


def get_db_path() -> str:
    import os
    return os.environ.get(
        "POSTHARVEST_DB_PATH",
        str(Path(__file__).parent.parent / "data" / "postharvest.db"),
    )


def get_media_dir() -> str:
    import os
    return os.environ.get(
        "POSTHARVEST_MEDIA_DIR",
        str(Path(__file__).parent.parent / "data" / "media"),
    )
