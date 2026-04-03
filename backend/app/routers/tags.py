import sqlite3

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("")
def list_tags(request: Request) -> list[str]:
    db = request.app.state.db
    db.row_factory = sqlite3.Row
    rows = db.execute("SELECT DISTINCT tag FROM tags ORDER BY tag").fetchall()
    return [row["tag"] for row in rows]
