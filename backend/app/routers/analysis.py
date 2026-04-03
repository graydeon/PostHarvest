import sqlite3

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

router = APIRouter(prefix="/api", tags=["analysis"])


@router.post("/posts/{post_id}/analyze")
def analyze_post_endpoint(post_id: int, request: Request):
    """Run NLP analysis on a post (sentiment, entities, embedding)."""
    from app.analysis import analyze_post

    db = request.app.state.db
    db.row_factory = sqlite3.Row
    row = db.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")

    analyze_post(post_id, db)
    return {"status": "analyzed", "post_id": post_id}


@router.post("/analyze-all")
def analyze_all_posts(request: Request, background_tasks: BackgroundTasks):
    """Run analysis on all posts that haven't been analyzed yet."""
    from app.analysis import analyze_post

    db = request.app.state.db
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT p.id FROM posts p LEFT JOIN embeddings e ON p.id = e.post_id WHERE e.post_id IS NULL"
    ).fetchall()

    for row in rows:
        background_tasks.add_task(analyze_post, row["id"], db)

    return {"status": "queued", "count": len(rows)}


@router.get("/posts/{post_id}/similar")
def get_similar_posts(post_id: int, request: Request, limit: int = 10):
    """Find posts similar to this one by content embedding."""
    from app.analysis import find_similar_posts

    db = request.app.state.db
    db.row_factory = sqlite3.Row
    row = db.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")

    results = find_similar_posts(post_id, db, top_n=limit)
    return {"post_id": post_id, "similar": results}


@router.get("/posts/{post_id}/entities")
def get_post_entities(post_id: int, request: Request):
    """Get extracted entities for a post."""
    db = request.app.state.db
    db.row_factory = sqlite3.Row
    row = db.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")

    entities = db.execute(
        "SELECT id, text, label FROM entities WHERE post_id = ? ORDER BY label, text",
        (post_id,),
    ).fetchall()
    return [dict(e) for e in entities]


@router.get("/clusters")
def get_clusters(request: Request, n: int = 0):
    """Get auto-clustered groups of posts."""
    from app.analysis import cluster_posts

    db = request.app.state.db
    result = cluster_posts(db, n_clusters=n)
    return {"clusters": result}
