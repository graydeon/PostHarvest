# PostHarvest — Handoff

## What This Is

Firefox browser extension + local Python backend for saving X/Twitter posts. Purpose: study marketing patterns, engagement strategies, and content trends without paying for the Twitter API.

## Architecture

- **Extension** (`extension/`): MV3 Firefox extension. Content script injects a harvest button into each tweet's action bar on x.com. On click, scrapes post data (text, author, metrics, media URLs) from the DOM and POSTs to the local backend.
- **Backend** (`backend/`): FastAPI on port 8688. SQLite database at `backend/data/postharvest.db`. Media downloads saved to `backend/data/media/{tweet_id}/`.
- **Dashboard** (`frontend/`): Vanilla HTML/JS/CSS served by FastAPI. Post feed, detail view with tagging/categorization, category management, analytics.

## Running

```bash
# Backend
cd backend && .venv/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8688

# Extension
# Firefox → about:debugging → Load Temporary Add-on → extension/manifest.json
```

Also registered in infra-dashboard for start/stop management.

## Key Design Decisions

- **DOM scraping over API**: No Twitter API cost. Trade-off: scraping can break when X changes their DOM structure. The selectors in `inject.js` target `data-testid` attributes which are relatively stable.
- **SQLite over Postgres**: Single-user tool, no concurrent write pressure. Keeps deployment simple.
- **Async media download**: Media downloads happen after the post is saved and confirmed. If a download fails, the post metadata is still preserved.
- **Predefined categories + free tags**: Categories provide structured analysis axes (Hook Style, Content Type, Industry). Tags provide flexibility.

## Known Limitations

- Extension only works on Firefox (MV3). Chrome/Edge support planned but not implemented.
- DOM selectors may need updating when X changes their frontend.
- Video download may not capture all formats (e.g., HLS streams).
- No pagination in the dashboard yet.

## Database

SQLite at `backend/data/postharvest.db`. Tables: `posts`, `media`, `categories`, `category_values`, `post_categories`, `tags`. Default categories seeded on first run.

## API

Full REST API at `http://localhost:8688/api/`. FastAPI auto-docs at `/docs`.
