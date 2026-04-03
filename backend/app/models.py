from datetime import datetime

from pydantic import BaseModel


# --- Request models (from extension / API clients) ---


class PostCreate(BaseModel):
    """Payload from the extension when saving a post."""
    tweet_id: str
    author_handle: str
    author_name: str = ""
    text: str = ""
    url: str
    posted_at: str | None = None
    likes: int = 0
    retweets: int = 0
    replies: int = 0
    views: int = 0
    media_urls: list[dict] = []  # [{"url": "...", "type": "image"|"video"}]


class PostUpdate(BaseModel):
    """Payload for updating notes, tags, categories on a post."""
    notes: str | None = None
    tags: list[str] | None = None
    category_value_ids: list[int] | None = None


class CategoryCreate(BaseModel):
    name: str


class CategoryValueCreate(BaseModel):
    value: str


# --- Response models ---


class MediaResponse(BaseModel):
    id: int
    type: str
    original_url: str
    filename: str


class TagResponse(BaseModel):
    id: int
    tag: str


class CategoryValueResponse(BaseModel):
    id: int
    value: str


class CategoryResponse(BaseModel):
    id: int
    name: str
    values: list[CategoryValueResponse] = []


class PostResponse(BaseModel):
    id: int
    tweet_id: str
    author_handle: str
    author_name: str
    text: str
    url: str
    posted_at: str | None
    saved_at: str
    likes: int
    retweets: int
    replies: int
    views: int
    notes: str
    sentiment_score: float | None = None
    sentiment_label: str = ""
    media: list[MediaResponse] = []
    tags: list[TagResponse] = []
    categories: list[CategoryValueResponse] = []


class PostListResponse(BaseModel):
    posts: list[PostResponse]
    total: int


class StatsResponse(BaseModel):
    total_posts: int
    total_authors: int
    avg_likes: float
    avg_retweets: float
    avg_views: float
    top_authors: list[dict]
    category_distribution: list[dict]
