import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import get_db_path, get_media_dir, init_db, set_db_path


def create_app() -> FastAPI:
    db_path = get_db_path()
    media_dir = get_media_dir()

    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    Path(media_dir).mkdir(parents=True, exist_ok=True)

    conn = init_db(db_path)
    set_db_path(db_path)

    app = FastAPI(title="PostHarvest", version="0.1.0")

    app.state.db = conn
    app.state.db_path = db_path
    app.state.media_dir = media_dir

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Import and register routers
    from app.routers import analysis, categories, export, posts, stats, tags

    app.include_router(export.router)
    app.include_router(posts.router)
    app.include_router(categories.router)
    app.include_router(tags.router)
    app.include_router(stats.router)
    app.include_router(analysis.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/posts/{post_id}/media/{filename}")
    def serve_media(post_id: int, filename: str):
        db = app.state.db
        db.row_factory = sqlite3.Row
        row = db.execute(
            "SELECT local_path FROM media WHERE post_id = ? AND filename = ?",
            (post_id, filename),
        ).fetchone()
        if not row or not row["local_path"]:
            raise HTTPException(status_code=404, detail="Media not found")
        file_path = Path(row["local_path"])
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Media file missing from disk")
        return FileResponse(str(file_path))

    # Mount frontend dashboard
    frontend_dir = Path(__file__).parent.parent.parent / "frontend"
    if frontend_dir.exists():
        app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

    return app


app = create_app()
