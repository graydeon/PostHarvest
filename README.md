# PostHarvest

Save X/Twitter posts locally for marketing research and trend analysis.

A Firefox browser extension that injects a save button into each tweet's action bar. Click to save the post — text, author, engagement metrics, and media — to a local database. Browse, search, categorize, and analyze your saved posts through a local dashboard and REST API.

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8686
```

Dashboard: http://localhost:8686

### Extension

1. Open Firefox → `about:debugging` → This Firefox → Load Temporary Add-on
2. Select `extension/manifest.json`
3. Browse X/Twitter — click the harvest button on any post to save it

## Tech Stack

- **Extension:** JavaScript, Firefox Manifest V3
- **Backend:** Python, FastAPI, SQLite
- **Dashboard:** Vanilla HTML/JS/CSS

## License

MIT
