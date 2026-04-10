# PostHarvest Improvements — Design Spec
**Date:** 2026-04-09

## Overview

Six improvements to PostHarvest: cross-browser extension support, dashboard pagination, HLS video capture, data export (CSV/JSON/LLM), richer analytics, and a search/filter UI. The dashboard is refactored from a single-view feed into a three-tab layout: Feed, Analytics, Export.

---

## 1. Cross-Browser Extension Support

### Goal
The extension must work in Firefox, Chrome, and Edge from a single codebase.

### Approach
`webextension-polyfill` is already installed in `extension/lib/`. The content scripts already use the `browser.*` API via the polyfill. What's missing is browser-specific manifests and a build step.

### Implementation
- Rename current `manifest.json` → `manifest.firefox.json`
- Create `manifest.chrome.json` — identical except:
  - Remove `browser_specific_settings` (Firefox-only key)
  - Service worker declaration stays the same (MV3 is shared)
- Add `extension/build.sh`: copies the appropriate manifest to `manifest.json` based on a `--browser` argument (`firefox` or `chrome`)
- Document loading in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/`
- No separate Chrome-specific JS needed — polyfill handles API differences

---

## 2. Dashboard Three-Tab Navigation

### Goal
Replace the current single-view dashboard with three focused tabs: Feed, Analytics, Export.

### Layout
```
[ Feed ]  [ Analytics ]  [ Export ]        (tab bar, top of page)
```

The toolbar (search, filter drawer, export button) moves into the Feed tab. Analytics and Export get full-page layouts within their tabs.

### Tab: Feed
- Search bar (text search across post body, author handle, tags)
- Filter button opens a collapsible drawer with dropdowns for: hook style, content type, industry, tags, date range
- Active filters shown as dismissible chips below the toolbar
- Post feed with load-more pagination (replaces hard 50-post limit)
- Filter state is shared with the Analytics tab (charts reflect current filter)

### Tab: Analytics
See section 5.

### Tab: Export
See section 4.

---

## 3. Search & Pagination

### Search
- Frontend sends `?q=<term>` query param to `GET /api/posts`
- Backend does `LIKE` search across `text`, `author_handle`, and joins on `tags.name`
- Debounced on the frontend (300ms) to avoid hammering on every keystroke

### Pagination
- Backend already supports `limit` and `offset` params (currently unused by frontend)
- Frontend uses `offset`-based pagination with a "Load more" button
- Initial page size: 25 posts. Each "Load more" appends 25 more.
- Replaces the current hard-coded limit of 50

### Filter params (new backend support needed)
- `?category=<name>&value=<val>` — filter by category assignment
- `?tag=<name>` — filter by tag
- `?date_from=<iso>&date_to=<iso>` — date range filter
- Multiple filters combined with AND logic

---

## 4. Export

### Endpoint
`GET /api/posts/export?format=<csv|json|llm>&<filter params>`

All existing filter params apply — export respects the current scope (all posts, filtered subset, or date range).

### CSV format
One post per row. Columns: `id`, `url`, `author_handle`, `author_name`, `text`, `likes`, `retweets`, `replies`, `harvested_at`, `tags` (semicolon-separated), `categories` (key:value pairs, semicolon-separated), `media_count`.

### JSON format
Full-fidelity array of post objects including nested tags, categories, and media metadata. Same shape as the existing `GET /api/posts` response.

### LLM-ready JSON format
Flattened single JSON object optimized for injecting into an LLM context window:
```json
{
  "exported_at": "...",
  "post_count": 42,
  "filters_applied": {...},
  "posts": [
    {
      "id": 1,
      "text": "...",
      "author": "@handle",
      "metrics": {"likes": 1200, "retweets": 340, "replies": 88},
      "tags": ["viral", "hook"],
      "categories": {"Hook Style": "Question", "Content Type": "Thread"},
      "harvested_at": "..."
    }
  ]
}
```
No nested media objects (too noisy for LLM context). Response header includes `Content-Disposition` for file download; raw JSON also accessible via API for programmatic use.

### Export Tab UI
- Three buttons: Download CSV / Download JSON / Download LLM JSON
- Scope selector: All Posts | Current Filter | Date Range (date picker)
- Post count preview ("48 posts will be exported")

---

## 5. Analytics

### Charts (Chart.js, already installed)
1. **Engagement by Hook Style** — horizontal bar chart, avg likes per hook style category value
2. **Content Type Mix** — donut chart, post count by content type
3. **Industry Breakdown** — horizontal bar chart, post count by industry
4. **Harvest Trend** — line chart, posts harvested per day; time range toggle (7d / 30d / 90d)

### Backend
New endpoint: `GET /api/stats/analytics?<filter params>`

Returns pre-aggregated data for all four charts in a single response:
```json
{
  "engagement_by_hook": [{"label": "Question", "avg_likes": 1840}, ...],
  "content_type_mix": [{"label": "Thread", "count": 32}, ...],
  "industry_breakdown": [{"label": "SaaS", "count": 18}, ...],
  "harvest_trend": [{"date": "2026-04-01", "count": 5}, ...]
}
```

### Filter integration
Analytics respects the same filter state as the Feed tab. When the user switches to Analytics, the charts are scoped to the active filters.

---

## 6. HLS Video Capture

### Goal
Download video content from tweets, including HLS streams (`.m3u8`), which the current `httpx`-based downloader cannot handle.

### Approach
Use `yt-dlp` as a subprocess during media download. `yt-dlp` handles HLS natively and covers standard MP4 video as well, so it replaces the existing direct URL download for video media.

### Implementation
- Add `yt-dlp` to backend dependencies
- In `media.py`: detect media type; for `video`, invoke `yt-dlp` as subprocess with `--output` pointing to the media directory
- Image/GIF downloads continue using `httpx` (no change)
- `yt-dlp` failure is non-fatal: log the error, post metadata is already saved

---

## File Changes Summary

| File | Change |
|------|--------|
| `extension/manifest.json` | Rename to `manifest.firefox.json` |
| `extension/manifest.chrome.json` | New — Chrome/Edge variant |
| `extension/build.sh` | New — manifest copy script |
| `frontend/index.html` | Add three-tab nav structure |
| `frontend/app.js` | Refactor into Feed/Analytics/Export tabs; add search, filter drawer, pagination |
| `frontend/styles.css` | Tab styles, filter chips, drawer animation |
| `backend/app/routers/posts.py` | Add search + filter query params |
| `backend/app/routers/stats.py` | Add `/api/stats/analytics` endpoint |
| `backend/app/routers/export.py` | New — CSV/JSON/LLM export endpoint |
| `backend/app/media.py` | Add yt-dlp subprocess for video |
| `backend/app/main.py` | Register export router |

---

## Out of Scope
- Authentication / multi-user support
- Cloud sync
- Automated harvesting (no headless browser)
- Real-time push updates to dashboard
