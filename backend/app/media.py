import sqlite3
import subprocess
from pathlib import Path
from urllib.parse import urlparse

import httpx


def download_media_for_post(post_id: int, tweet_id: str, db: sqlite3.Connection, media_dir: str):
    """Download all media files for a post.

    Videos: yt-dlp subprocess (handles HLS/.m3u8 and standard MP4).
    Images/GIFs: httpx.
    Failures are non-fatal — post metadata is already saved.
    """
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT id, original_url, type FROM media WHERE post_id = ? AND local_path = ''",
        (post_id,),
    ).fetchall()

    if not rows:
        return

    post_media_dir = Path(media_dir) / tweet_id
    post_media_dir.mkdir(parents=True, exist_ok=True)

    with httpx.Client(timeout=30) as client:
        for row in rows:
            try:
                if row["type"] == "video":
                    _download_video(row["id"], row["original_url"], post_media_dir, db)
                else:
                    _download_image(row["id"], row["original_url"], row["type"], post_media_dir, db, client)
            except Exception:
                continue

    db.commit()


def _download_video(media_id: int, url: str, dest_dir: Path, db: sqlite3.Connection) -> None:
    """Download video using yt-dlp. Updates DB on success; skips silently on failure."""
    output_template = str(dest_dir / f"{media_id}.%(ext)s")
    try:
        result = subprocess.run(
            ["yt-dlp", "--output", output_template, "--quiet", "--no-playlist", url],
            capture_output=True,
            timeout=120,
        )
        if result.returncode != 0:
            return
        matches = list(dest_dir.glob(f"{media_id}.*"))
        if not matches:
            return
        file_path = matches[0]
        db.execute(
            "UPDATE media SET local_path = ?, filename = ? WHERE id = ?",
            (str(file_path), file_path.name, media_id),
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return


def _download_image(
    media_id: int,
    url: str,
    media_type: str,
    dest_dir: Path,
    db: sqlite3.Connection,
    client: httpx.Client,
) -> None:
    """Download image or GIF using httpx."""
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix or (".jpg" if media_type == "image" else ".gif")
    filename = f"{media_id}{ext}"
    file_path = dest_dir / filename
    resp = client.get(url)
    if resp.status_code == 200:
        file_path.write_bytes(resp.content)
        db.execute(
            "UPDATE media SET local_path = ?, filename = ? WHERE id = ?",
            (str(file_path), filename, media_id),
        )
