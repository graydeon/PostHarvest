import asyncio
import sqlite3
from pathlib import Path
from urllib.parse import urlparse

import aiohttp


async def download_media_for_post(post_id: int, tweet_id: str, db: sqlite3.Connection, media_dir: str):
    """Download all media files for a post in the background."""
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT id, original_url, type FROM media WHERE post_id = ? AND local_path = ''",
        (post_id,),
    ).fetchall()

    if not rows:
        return

    post_media_dir = Path(media_dir) / tweet_id
    post_media_dir.mkdir(parents=True, exist_ok=True)

    async with aiohttp.ClientSession() as session:
        for row in rows:
            try:
                url = row["original_url"]
                parsed = urlparse(url)
                ext = Path(parsed.path).suffix or (".jpg" if row["type"] == "image" else ".mp4")
                filename = f"{row['id']}{ext}"
                file_path = post_media_dir / filename

                async with session.get(url) as resp:
                    if resp.status == 200:
                        content = await resp.read()
                        file_path.write_bytes(content)
                        db.execute(
                            "UPDATE media SET local_path = ?, filename = ? WHERE id = ?",
                            (str(file_path), filename, row["id"]),
                        )

            except Exception:
                continue

    db.commit()
