import sqlite3

from fastapi import APIRouter, Request

from app.models import StatsResponse

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def get_stats(request: Request) -> StatsResponse:
    db = request.app.state.db
    db.row_factory = sqlite3.Row

    totals = db.execute(
        """
        SELECT
            COUNT(*) as total_posts,
            COUNT(DISTINCT author_handle) as total_authors,
            COALESCE(AVG(likes), 0) as avg_likes,
            COALESCE(AVG(retweets), 0) as avg_retweets,
            COALESCE(AVG(views), 0) as avg_views
        FROM posts
        """
    ).fetchone()

    top_authors = db.execute(
        """
        SELECT author_handle, author_name, COUNT(*) as count
        FROM posts GROUP BY author_handle
        ORDER BY count DESC LIMIT 10
        """
    ).fetchall()

    cat_dist = db.execute(
        """
        SELECT c.name as category, cv.value, COUNT(pc.post_id) as count
        FROM post_categories pc
        JOIN category_values cv ON pc.category_value_id = cv.id
        JOIN categories c ON cv.category_id = c.id
        GROUP BY cv.id
        ORDER BY count DESC
        """
    ).fetchall()

    return StatsResponse(
        total_posts=totals["total_posts"],
        total_authors=totals["total_authors"],
        avg_likes=round(totals["avg_likes"], 1),
        avg_retweets=round(totals["avg_retweets"], 1),
        avg_views=round(totals["avg_views"], 1),
        top_authors=[dict(row) for row in top_authors],
        category_distribution=[dict(row) for row in cat_dist],
    )
