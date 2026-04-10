import csv
import io
import json
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from app.routers.posts import _build_filter_where

router = APIRouter(prefix="/api/posts", tags=["export"])


def _get_posts_raw(db: sqlite3.Connection, where_sql: str, params: list) -> list:
    db.row_factory = sqlite3.Row
    return db.execute(
        f"SELECT * FROM posts p {where_sql} ORDER BY p.saved_at DESC",
        params,
    ).fetchall()


def _tags(db: sqlite3.Connection, post_id: int) -> list[str]:
    rows = db.execute("SELECT tag FROM tags WHERE post_id = ?", (post_id,)).fetchall()
    return [r["tag"] for r in rows]


def _categories(db: sqlite3.Connection, post_id: int) -> dict[str, str]:
    rows = db.execute(
        """
        SELECT c.name as cat_name, cv.value as cat_value
        FROM post_categories pc
        JOIN category_values cv ON pc.category_value_id = cv.id
        JOIN categories c ON cv.category_id = c.id
        WHERE pc.post_id = ?
        """,
        (post_id,),
    ).fetchall()
    return {r["cat_name"]: r["cat_value"] for r in rows}


def _media_count(db: sqlite3.Connection, post_id: int) -> int:
    return db.execute("SELECT COUNT(*) FROM media WHERE post_id = ?", (post_id,)).fetchone()[0]


@router.get("/export")
def export_posts(
    request: Request,
    format: str = "json",
    q: str | None = None,
    author: str | None = None,
    tag: str | None = None,
    category_value_id: list[int] = Query(default=[]),
    date_from: str | None = None,
    date_to: str | None = None,
):
    if format not in ("csv", "json", "llm"):
        raise HTTPException(status_code=400, detail="format must be csv, json, or llm")

    db = request.app.state.db
    db.row_factory = sqlite3.Row

    where_sql, params = _build_filter_where(q, author, tag, category_value_id, date_from, date_to)
    rows = _get_posts_raw(db, where_sql, params)

    filters_applied = {
        k: v for k, v in {
            "q": q, "author": author, "tag": tag,
            "category_value_ids": category_value_id or None,
            "date_from": date_from, "date_to": date_to,
        }.items() if v is not None
    }

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "id", "url", "author_handle", "author_name", "text",
            "likes", "retweets", "replies", "harvested_at",
            "tags", "categories", "media_count",
        ])
        writer.writeheader()
        for row in rows:
            post_id = row["id"]
            writer.writerow({
                "id": row["id"],
                "url": row["url"],
                "author_handle": row["author_handle"],
                "author_name": row["author_name"],
                "text": row["text"],
                "likes": row["likes"],
                "retweets": row["retweets"],
                "replies": row["replies"],
                "harvested_at": row["saved_at"],
                "tags": ";".join(_tags(db, post_id)),
                "categories": ";".join(f"{k}:{v}" for k, v in _categories(db, post_id).items()),
                "media_count": _media_count(db, post_id),
            })
        return Response(
            content=output.getvalue().encode("utf-8"),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="postharvest-export.csv"'},
        )

    if format == "json":
        posts_out = []
        for row in rows:
            post_id = row["id"]
            media_rows = db.execute(
                "SELECT id, type, original_url, filename FROM media WHERE post_id = ?", (post_id,)
            ).fetchall()
            posts_out.append({
                "id": row["id"],
                "tweet_id": row["tweet_id"],
                "url": row["url"],
                "author_handle": row["author_handle"],
                "author_name": row["author_name"],
                "text": row["text"],
                "likes": row["likes"],
                "retweets": row["retweets"],
                "replies": row["replies"],
                "views": row["views"],
                "harvested_at": row["saved_at"],
                "tags": _tags(db, post_id),
                "categories": _categories(db, post_id),
                "media": [dict(m) for m in media_rows],
            })
        return Response(
            content=json.dumps(posts_out, indent=2, ensure_ascii=False).encode("utf-8"),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="postharvest-export.json"'},
        )

    # format == "llm"
    posts_out = []
    for row in rows:
        post_id = row["id"]
        posts_out.append({
            "id": row["id"],
            "text": row["text"],
            "author": row["author_handle"],
            "metrics": {
                "likes": row["likes"],
                "retweets": row["retweets"],
                "replies": row["replies"],
                "views": row["views"],
            },
            "tags": _tags(db, post_id),
            "categories": _categories(db, post_id),
            "harvested_at": row["saved_at"],
        })

    envelope = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "post_count": len(posts_out),
        "filters_applied": filters_applied,
        "posts": posts_out,
    }
    return Response(
        content=json.dumps(envelope, indent=2, ensure_ascii=False).encode("utf-8"),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="postharvest-llm.json"'},
    )
