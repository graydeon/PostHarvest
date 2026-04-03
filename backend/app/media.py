import sqlite3
from pathlib import Path
from urllib.parse import urlparse

import httpx


def download_media_for_post(post_id: int, tweet_id: str, db: sqlite3.Connection, media_dir: str):
    """Download all media files for a post."""
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
                url = row["original_url"]
                parsed = urlparse(url)
                ext = Path(parsed.path).suffix or (".jpg" if row["type"] == "image" else ".mp4")
                filename = f"{row['id']}{ext}"
                file_path = post_media_dir / filename

                resp = client.get(url)
                if resp.status_code == 200:
                    file_path.write_bytes(resp.content)
                    db.execute(
                        "UPDATE media SET local_path = ?, filename = ? WHERE id = ?",
                        (str(file_path), filename, row["id"]),
                    )

            except Exception:
                continue

    db.commit()
