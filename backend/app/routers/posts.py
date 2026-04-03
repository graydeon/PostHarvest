import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.models import (
    CategoryValueResponse,
    MediaResponse,
    PostCreate,
    PostListResponse,
    PostResponse,
    PostUpdate,
    TagResponse,
)

router = APIRouter(prefix="/api/posts", tags=["posts"])


def _row_to_post(row: dict, db: sqlite3.Connection) -> PostResponse:
    post_id = row["id"]

    media_rows = db.execute(
        "SELECT id, type, original_url, filename FROM media WHERE post_id = ?",
        (post_id,),
    ).fetchall()
    media = [MediaResponse(id=m["id"], type=m["type"], original_url=m["original_url"], filename=m["filename"]) for m in media_rows]

    tag_rows = db.execute(
        "SELECT id, tag FROM tags WHERE post_id = ?", (post_id,)
    ).fetchall()
    tags = [TagResponse(id=t["id"], tag=t["tag"]) for t in tag_rows]

    cat_rows = db.execute(
        """
        SELECT cv.id, cv.value FROM category_values cv
        JOIN post_categories pc ON pc.category_value_id = cv.id
        WHERE pc.post_id = ?
        """,
        (post_id,),
    ).fetchall()
    categories = [CategoryValueResponse(id=c["id"], value=c["value"]) for c in cat_rows]

    return PostResponse(
        id=row["id"],
        tweet_id=row["tweet_id"],
        author_handle=row["author_handle"],
        author_name=row["author_name"],
        text=row["text"],
        url=row["url"],
        posted_at=row["posted_at"],
        saved_at=row["saved_at"],
        likes=row["likes"],
        retweets=row["retweets"],
        replies=row["replies"],
        views=row["views"],
        notes=row["notes"] or "",
        media=media,
        tags=tags,
        categories=categories,
    )


@router.post("", status_code=201)
def create_post(post: PostCreate, request: Request, background_tasks: BackgroundTasks) -> PostResponse:
    db = request.app.state.db
    db.row_factory = sqlite3.Row

    existing = db.execute(
        "SELECT id FROM posts WHERE tweet_id = ?", (post.tweet_id,)
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Post already saved")

    saved_at = datetime.now(timezone.utc).isoformat()
    cursor = db.execute(
        """
        INSERT INTO posts (tweet_id, author_handle, author_name, text, url, posted_at, saved_at,
                           likes, retweets, replies, views)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            post.tweet_id, post.author_handle, post.author_name, post.text,
            post.url, post.posted_at, saved_at,
            post.likes, post.retweets, post.replies, post.views,
        ),
    )
    post_id = cursor.lastrowid

    for m in post.media_urls:
        db.execute(
            "INSERT INTO media (post_id, type, original_url) VALUES (?, ?, ?)",
            (post_id, m.get("type", "image"), m["url"]),
        )

    db.commit()

    # Download media in background
    from app.media import download_media_for_post
    media_dir = request.app.state.media_dir
    background_tasks.add_task(download_media_for_post, post_id, post.tweet_id, db, media_dir)

    row = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    return _row_to_post(row, db)


@router.get("/{post_id}")
def get_post(post_id: int, request: Request) -> PostResponse:
    db = request.app.state.db
    db.row_factory = sqlite3.Row

    row = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    return _row_to_post(row, db)


@router.get("")
def list_posts(
    request: Request,
    author: str | None = None,
    tag: str | None = None,
    category_value_id: int | None = None,
    q: str | None = None,
    offset: int = 0,
    limit: int = 50,
) -> PostListResponse:
    db = request.app.state.db
    db.row_factory = sqlite3.Row

    where_clauses = []
    params: list = []

    if author:
        where_clauses.append("p.author_handle = ?")
        params.append(author)
    if tag:
        where_clauses.append("p.id IN (SELECT post_id FROM tags WHERE tag = ?)")
        params.append(tag)
    if category_value_id:
        where_clauses.append("p.id IN (SELECT post_id FROM post_categories WHERE category_value_id = ?)")
        params.append(category_value_id)
    if q:
        where_clauses.append("p.text LIKE ?")
        params.append(f"%{q}%")

    where_sql = " AND ".join(where_clauses)
    if where_sql:
        where_sql = "WHERE " + where_sql

    count_row = db.execute(f"SELECT COUNT(*) as cnt FROM posts p {where_sql}", params).fetchone()
    total = count_row["cnt"]

    rows = db.execute(
        f"SELECT * FROM posts p {where_sql} ORDER BY p.saved_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    posts = [_row_to_post(row, db) for row in rows]
    return PostListResponse(posts=posts, total=total)


@router.put("/{post_id}")
def update_post(post_id: int, update: PostUpdate, request: Request) -> PostResponse:
    db = request.app.state.db
    db.row_factory = sqlite3.Row

    row = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")

    if update.notes is not None:
        db.execute("UPDATE posts SET notes = ? WHERE id = ?", (update.notes, post_id))

    if update.tags is not None:
        db.execute("DELETE FROM tags WHERE post_id = ?", (post_id,))
        for tag in update.tags:
            db.execute("INSERT INTO tags (post_id, tag) VALUES (?, ?)", (post_id, tag))

    if update.category_value_ids is not None:
        db.execute("DELETE FROM post_categories WHERE post_id = ?", (post_id,))
        for cv_id in update.category_value_ids:
            db.execute(
                "INSERT INTO post_categories (post_id, category_value_id) VALUES (?, ?)",
                (post_id, cv_id),
            )

    db.commit()
    row = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    return _row_to_post(row, db)


@router.delete("/{post_id}", status_code=204)
def delete_post(post_id: int, request: Request):
    db = request.app.state.db

    row = db.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")

    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()
