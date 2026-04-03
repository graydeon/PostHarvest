import os
import sqlite3
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def temp_data_dir(tmp_path):
    """Provide a temporary data directory for tests."""
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    return tmp_path


@pytest.fixture
def db_conn(temp_data_dir):
    """Provide a fresh database connection with schema initialized."""
    from app.database import init_db

    db_path = str(temp_data_dir / "test.db")
    conn = init_db(db_path)
    yield conn
    conn.close()


@pytest.fixture
def client(temp_data_dir):
    """Provide a FastAPI test client with a temp database."""
    os.environ["POSTHARVEST_DB_PATH"] = str(temp_data_dir / "test.db")
    os.environ["POSTHARVEST_MEDIA_DIR"] = str(temp_data_dir / "media")

    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c

    del os.environ["POSTHARVEST_DB_PATH"]
    del os.environ["POSTHARVEST_MEDIA_DIR"]
