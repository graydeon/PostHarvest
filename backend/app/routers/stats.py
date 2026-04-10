import sqlite3

from fastapi import APIRouter, Query, Request

from app.models import StatsResponse
from app.routers.posts import _build_filter_where

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


@router.get("/analytics")
def get_analytics(
    request: Request,
    q: str | None = None,
    author: str | None = None,
    tag: str | None = None,
    category_value_id: list[int] = Query(default=[]),
    date_from: str | None = None,
    date_to: str | None = None,
    days: int = 30,
) -> dict:
    db = request.app.state.db
    db.row_factory = sqlite3.Row

    where_sql, params = _build_filter_where(q, author, tag, category_value_id, date_from, date_to)

    # Engagement by Hook Style — avg likes per hook style value
    if where_sql:
        hook_where = where_sql + ' AND c.name = "Hook Style"'
    else:
        hook_where = 'WHERE c.name = "Hook Style"'

    hook_rows = db.execute(
        f"""
        SELECT cv.value as label, ROUND(AVG(p.likes), 1) as avg_likes
        FROM posts p
        JOIN post_categories pc ON pc.post_id = p.id
        JOIN category_values cv ON pc.category_value_id = cv.id
        JOIN categories c ON cv.category_id = c.id
        {hook_where}
        GROUP BY cv.id
        ORDER BY avg_likes DESC
        """,
        params,
    ).fetchall()

    if where_sql:
        content_where = where_sql + ' AND c.name = "Content Type"'
    else:
        content_where = 'WHERE c.name = "Content Type"'

    content_rows = db.execute(
        f"""
        SELECT cv.value as label, COUNT(DISTINCT pc.post_id) as count
        FROM posts p
        JOIN post_categories pc ON pc.post_id = p.id
        JOIN category_values cv ON pc.category_value_id = cv.id
        JOIN categories c ON cv.category_id = c.id
        {content_where}
        GROUP BY cv.id
        ORDER BY count DESC
        """,
        params,
    ).fetchall()

    if where_sql:
        industry_where = where_sql + ' AND c.name = "Industry"'
    else:
        industry_where = 'WHERE c.name = "Industry"'

    industry_rows = db.execute(
        f"""
        SELECT cv.value as label, COUNT(DISTINCT pc.post_id) as count
        FROM posts p
        JOIN post_categories pc ON pc.post_id = p.id
        JOIN category_values cv ON pc.category_value_id = cv.id
        JOIN categories c ON cv.category_id = c.id
        {industry_where}
        GROUP BY cv.id
        ORDER BY count DESC
        """,
        params,
    ).fetchall()

    # Add a date-range condition for the trend window
    trend_date_clause = f"DATE(p.saved_at) >= DATE('now', '-{int(days)} days')"
    if where_sql:
        trend_where = where_sql + f" AND {trend_date_clause}"
    else:
        trend_where = f"WHERE {trend_date_clause}"

    trend_rows = db.execute(
        f"""
        SELECT DATE(p.saved_at) as date, COUNT(*) as count
        FROM posts p
        {trend_where}
        GROUP BY DATE(p.saved_at)
        ORDER BY date ASC
        """,
        params,
    ).fetchall()

    return {
        "engagement_by_hook": [dict(r) for r in hook_rows],
        "content_type_mix": [dict(r) for r in content_rows],
        "industry_breakdown": [dict(r) for r in industry_rows],
        "harvest_trend": [dict(r) for r in trend_rows],
    }
