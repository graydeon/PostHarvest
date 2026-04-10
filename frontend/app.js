const API = "";

// ── Global state ──
let allCategories = [];
let chartInstances = {};
let filterState = {
  q: "",
  author: "",
  tag: "",
  hookId: null,
  contentTypeId: null,
  industryId: null,
  dateFrom: "",
  dateTo: "",
};
let feedOffset = 0;
const PAGE_SIZE = 25;
let feedTotal = 0;
let trendDays = 30;

// ── Navigation ──

document.querySelectorAll("[data-view]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    showView(link.dataset.view);
  });
});

document.getElementById("back-to-feed").addEventListener("click", () => showView("feed"));

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelectorAll("[data-view]").forEach((a) =>
    a.classList.toggle("active", a.dataset.view === name)
  );

  if (name === "feed") { feedOffset = 0; loadFeed(false); }
  if (name === "analytics") loadAnalytics();
  if (name === "categories") loadCategories();
  if (name === "export") refreshExportPreview();
}

// ── Filter state helpers ──

function buildFilterParams(extra = {}) {
  const p = new URLSearchParams();
  if (filterState.q) p.set("q", filterState.q);
  if (filterState.author) p.set("author", filterState.author);
  if (filterState.tag) p.set("tag", filterState.tag);
  if (filterState.hookId) p.append("category_value_id", filterState.hookId);
  if (filterState.contentTypeId) p.append("category_value_id", filterState.contentTypeId);
  if (filterState.industryId) p.append("category_value_id", filterState.industryId);
  if (filterState.dateFrom) p.set("date_from", filterState.dateFrom);
  if (filterState.dateTo) p.set("date_to", filterState.dateTo);
  Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p;
}

function renderChips() {
  const container = document.getElementById("active-chips");
  const chips = [];

  if (filterState.q) chips.push({ key: "q", label: `"${filterState.q}"` });
  if (filterState.author) chips.push({ key: "author", label: `@${filterState.author.replace(/^@/, "")}` });
  if (filterState.tag) chips.push({ key: "tag", label: `#${filterState.tag}` });
  if (filterState.dateFrom || filterState.dateTo) {
    chips.push({ key: "date", label: `${filterState.dateFrom || "…"} → ${filterState.dateTo || "…"}` });
  }

  [
    { key: "hookId", catName: "Hook Style" },
    { key: "contentTypeId", catName: "Content Type" },
    { key: "industryId", catName: "Industry" },
  ].forEach(({ key, catName }) => {
    if (!filterState[key]) return;
    const cat = allCategories.find((c) => c.name === catName);
    if (!cat) return;
    const val = cat.values.find((v) => v.id === filterState[key]);
    if (val) chips.push({ key, label: `${catName}: ${val.value}` });
  });

  container.innerHTML = chips
    .map(
      (c) =>
        `<span class="chip">${esc(c.label)}<button class="chip-remove" onclick="removeChip('${c.key}')" title="Remove filter">&#215;</button></span>`
    )
    .join("");
}

function removeChip(key) {
  if (key === "q") { filterState.q = ""; document.getElementById("search-input").value = ""; }
  else if (key === "author") { filterState.author = ""; document.getElementById("filter-author").value = ""; }
  else if (key === "tag") { filterState.tag = ""; document.getElementById("filter-tag").value = ""; }
  else if (key === "date") {
    filterState.dateFrom = ""; filterState.dateTo = "";
    document.getElementById("filter-date-from").value = "";
    document.getElementById("filter-date-to").value = "";
  }
  else if (key === "hookId") { filterState.hookId = null; document.getElementById("filter-hook").value = ""; }
  else if (key === "contentTypeId") { filterState.contentTypeId = null; document.getElementById("filter-content-type").value = ""; }
  else if (key === "industryId") { filterState.industryId = null; document.getElementById("filter-industry").value = ""; }

  feedOffset = 0;
  loadFeed(false);
  renderChips();
}

// ── Filter drawer ──

const filterToggle = document.getElementById("filter-toggle");
const filterDrawer = document.getElementById("filter-drawer");

filterToggle.addEventListener("click", () => {
  const open = !filterDrawer.hidden;
  filterDrawer.hidden = open;
  filterToggle.classList.toggle("active", !open);
});

document.getElementById("filter-clear").addEventListener("click", () => {
  filterState = { q: "", author: "", tag: "", hookId: null, contentTypeId: null, industryId: null, dateFrom: "", dateTo: "" };
  document.getElementById("search-input").value = "";
  document.getElementById("filter-author").value = "";
  document.getElementById("filter-tag").value = "";
  document.getElementById("filter-hook").value = "";
  document.getElementById("filter-content-type").value = "";
  document.getElementById("filter-industry").value = "";
  document.getElementById("filter-date-from").value = "";
  document.getElementById("filter-date-to").value = "";
  feedOffset = 0;
  loadFeed(false);
  renderChips();
});

// ── Search (debounced) ──

let searchTimeout;
document.getElementById("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filterState.q = e.target.value.trim();
    feedOffset = 0;
    loadFeed(false);
    renderChips();
  }, 300);
});

// ── Filter selects ──

document.getElementById("filter-author").addEventListener("change", (e) => {
  filterState.author = e.target.value;
  feedOffset = 0; loadFeed(false); renderChips();
});

document.getElementById("filter-tag").addEventListener("change", (e) => {
  filterState.tag = e.target.value;
  feedOffset = 0; loadFeed(false); renderChips();
});

document.getElementById("filter-hook").addEventListener("change", (e) => {
  filterState.hookId = e.target.value ? parseInt(e.target.value) : null;
  feedOffset = 0; loadFeed(false); renderChips();
});

document.getElementById("filter-content-type").addEventListener("change", (e) => {
  filterState.contentTypeId = e.target.value ? parseInt(e.target.value) : null;
  feedOffset = 0; loadFeed(false); renderChips();
});

document.getElementById("filter-industry").addEventListener("change", (e) => {
  filterState.industryId = e.target.value ? parseInt(e.target.value) : null;
  feedOffset = 0; loadFeed(false); renderChips();
});

document.getElementById("filter-date-from").addEventListener("change", (e) => {
  filterState.dateFrom = e.target.value;
  feedOffset = 0; loadFeed(false); renderChips();
});

document.getElementById("filter-date-to").addEventListener("change", (e) => {
  filterState.dateTo = e.target.value;
  feedOffset = 0; loadFeed(false); renderChips();
});

// ── Init categories ──

async function initCategories() {
  const r = await fetch(`${API}/api/categories`);
  allCategories = await r.json();

  const tagResp = await fetch(`${API}/api/tags`);
  const tags = await tagResp.json();

  const tagSelect = document.getElementById("filter-tag");
  tagSelect.innerHTML = '<option value="">All Tags</option>' +
    tags.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");

  const catMap = { "Hook Style": "filter-hook", "Content Type": "filter-content-type", "Industry": "filter-industry" };
  Object.entries(catMap).forEach(([catName, elemId]) => {
    const cat = allCategories.find((c) => c.name === catName);
    if (!cat) return;
    document.getElementById(elemId).innerHTML =
      '<option value="">Any</option>' +
      cat.values.map((v) => `<option value="${v.id}">${esc(v.value)}</option>`).join("");
  });
}

// ── Feed ──

async function loadFeed(append = false) {
  const params = buildFilterParams({ limit: PAGE_SIZE, offset: feedOffset });
  const resp = await fetch(`${API}/api/posts?${params}`);
  const data = await resp.json();

  feedTotal = data.total;
  const list = document.getElementById("posts-list");

  const cards = data.posts.map((p) => `
    <div class="post-card" onclick="loadPostDetail(${p.id})">
      <div class="post-card-header">
        <div>
          <span class="post-author">${esc(p.author_name)}</span>
          <span class="post-handle">${esc(p.author_handle)}</span>
          ${sentimentBadge(p.sentiment_label)}
        </div>
        <span class="post-date">${formatDate(p.saved_at)}</span>
      </div>
      <div class="post-text">${esc(p.text)}</div>
      <div class="post-metrics">
        <span class="metric">${fmtNum(p.likes)} likes</span>
        <span class="metric">${fmtNum(p.retweets)} retweets</span>
        <span class="metric">${fmtNum(p.replies)} replies</span>
        <span class="metric">${fmtNum(p.views)} views</span>
      </div>
      ${p.tags.length ? `<div class="post-tags">${p.tags.map((t) => `<span class="tag-badge">${esc(t.tag)}</span>`).join("")}</div>` : ""}
      ${p.media.length ? `<div class="post-media">${p.media.filter((m) => m.type === "image").slice(0, 4).map((m) => `<img src="${API}/api/posts/${p.id}/media/${esc(m.filename)}" alt="">`).join("")}</div>` : ""}
    </div>
  `).join("");

  if (append) {
    list.insertAdjacentHTML("beforeend", cards);
  } else {
    list.innerHTML = cards;
    // Update author dropdown
    const authors = [...new Set(data.posts.map((p) => p.author_handle))].sort();
    const authorSelect = document.getElementById("filter-author");
    const currentAuthor = filterState.author;
    authorSelect.innerHTML =
      '<option value="">All Authors</option>' +
      authors.map((a) => `<option value="${esc(a)}" ${a === currentAuthor ? "selected" : ""}>${esc(a)}</option>`).join("");
  }

  const loaded = feedOffset + data.posts.length;
  document.getElementById("load-more-container").hidden = loaded >= feedTotal;
}

document.getElementById("load-more-btn").addEventListener("click", () => {
  feedOffset += PAGE_SIZE;
  loadFeed(true);
});

function sentimentBadge(label) {
  if (!label) return "";
  const colors = { positive: "#22c55e", negative: "#ef4444", neutral: "#71767b" };
  return `<span class="sentiment-badge" style="color:${colors[label] || colors.neutral}">${label}</span>`;
}

// ── Post Detail ──

async function loadPostDetail(postId) {
  const [postResp, entitiesResp, similarResp] = await Promise.all([
    fetch(`${API}/api/posts/${postId}`),
    fetch(`${API}/api/posts/${postId}/entities`).catch(() => null),
    fetch(`${API}/api/posts/${postId}/similar?limit=5`).catch(() => null),
  ]);

  const post = await postResp.json();
  const entities = entitiesResp && entitiesResp.ok ? await entitiesResp.json() : [];
  const similarData = similarResp && similarResp.ok ? await similarResp.json() : { similar: [] };

  if (!allCategories.length) {
    const catResp = await fetch(`${API}/api/categories`);
    allCategories = await catResp.json();
  }

  const entityColors = {
    PERSON: "#8b5cf6", ORG: "#3b82f6", PRODUCT: "#f59e0b",
    GPE: "#10b981", MONEY: "#22c55e", EVENT: "#ec4899", WORK_OF_ART: "#f97316",
  };

  document.getElementById("post-detail").innerHTML = `
    <div class="post-card-header">
      <div>
        <span class="post-author">${esc(post.author_name)}</span>
        <span class="post-handle">${esc(post.author_handle)}</span>
      </div>
      <a href="${esc(post.url)}" target="_blank" style="color:var(--accent);font-size:13px;">View on X</a>
    </div>

    ${post.sentiment_label ? `
      <div class="analysis-bar">
        <span class="detail-section-title" style="margin:0;">Sentiment</span>
        ${sentimentBadge(post.sentiment_label)}
        <span style="color:var(--text-dim);font-size:12px;">(${post.sentiment_score})</span>
      </div>
    ` : ""}

    ${entities.length ? `
      <div style="margin-top:12px;">
        <div class="detail-section-title">Entities</div>
        <div class="entity-tags">
          ${entities.map((e) => `<span class="entity-tag" style="border-color:${entityColors[e.label] || "#666"};color:${entityColors[e.label] || "#999"}">${esc(e.text)} <small>${e.label}</small></span>`).join("")}
        </div>
      </div>
    ` : ""}

    <div class="detail-text">${esc(post.text)}</div>
    <div class="post-metrics">
      <span class="metric">${fmtNum(post.likes)} likes</span>
      <span class="metric">${fmtNum(post.retweets)} retweets</span>
      <span class="metric">${fmtNum(post.replies)} replies</span>
      <span class="metric">${fmtNum(post.views)} views</span>
    </div>
    ${post.media.length ? `<div class="detail-media">${post.media.map((m) => m.type === "image" ? `<img src="${API}/api/posts/${post.id}/media/${esc(m.filename)}" alt="">` : `<video src="${API}/api/posts/${post.id}/media/${esc(m.filename)}" controls></video>`).join("")}</div>` : ""}

    ${similarData.similar.length ? `
      <div class="detail-section-title">Similar Posts</div>
      <div class="similar-posts">
        ${similarData.similar.map((s) => `
          <div class="similar-post" onclick="loadPostDetail(${s.post_id})">
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-dim);font-size:12px;">${esc(s.author_handle)}</span>
              <span style="color:var(--accent);font-size:11px;">${Math.round(s.similarity * 100)}% match</span>
            </div>
            <div style="font-size:13px;margin-top:2px;">${esc(s.text)}</div>
          </div>
        `).join("")}
      </div>
    ` : ""}

    <div class="detail-section-title">Notes</div>
    <div class="detail-notes">
      <textarea id="detail-notes" placeholder="Add research notes...">${esc(post.notes)}</textarea>
    </div>
    <div class="detail-section-title">Tags</div>
    <input class="detail-tags-input" id="detail-tags" placeholder="Comma-separated tags" value="${post.tags.map((t) => t.tag).join(", ")}">
    <div class="detail-section-title">Categories</div>
    <div id="detail-categories">
      ${allCategories.map((cat) => `
        <div style="margin-top:8px;">
          <strong>${esc(cat.name)}</strong>
          <div class="category-values" style="margin-top:4px;">
            ${cat.values.map((v) => `
              <label style="cursor:pointer;">
                <input type="checkbox" value="${v.id}" ${post.categories.some((pc) => pc.id === v.id) ? "checked" : ""}>
                ${esc(v.value)}
              </label>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </div>
    <div class="detail-actions">
      <button class="save-btn" onclick="savePostUpdate(${post.id})">Save Changes</button>
      <button class="delete-btn" onclick="deletePost(${post.id})">Delete</button>
    </div>
  `;

  showView("detail");
}

async function deletePost(postId) {
  if (!confirm("Delete this post?")) return;
  await fetch(`${API}/api/posts/${postId}`, { method: "DELETE" });
  showView("feed");
}

async function savePostUpdate(postId) {
  const notes = document.getElementById("detail-notes").value;
  const tags = document.getElementById("detail-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
  const categoryValueIds = [...document.querySelectorAll("#detail-categories input[type=checkbox]:checked")].map((cb) => parseInt(cb.value));

  await fetch(`${API}/api/posts/${postId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes, tags, category_value_ids: categoryValueIds }),
  });

  loadPostDetail(postId);
}

// ── Categories ──

async function loadCategories() {
  const cats = await (await fetch(`${API}/api/categories`)).json();
  allCategories = cats;

  document.getElementById("categories-panel").innerHTML = cats.map((c) => `
    <div class="category-card">
      <h3>${esc(c.name)}</h3>
      <div class="category-values">
        ${c.values.map((v) => `<span class="category-value">${esc(v.value)}</span>`).join("")}
      </div>
    </div>
  `).join("");

  const tags = await (await fetch(`${API}/api/tags`)).json();
  document.getElementById("tags-cloud").innerHTML = `<div class="tags-cloud">${tags.map((t) => `<span class="tag-badge">${esc(t)}</span>`).join("")}</div>`;
}

// ── Analytics ──

function destroyCharts() {
  Object.values(chartInstances).forEach((c) => c.destroy());
  chartInstances = {};
}

async function loadAnalytics() {
  destroyCharts();

  const params = buildFilterParams({ days: trendDays });
  const data = await (await fetch(`${API}/api/stats/analytics?${params}`)).json();

  const hasFilters = Object.values(filterState).some((v) => v !== "" && v !== null);
  document.getElementById("analytics-filter-note").textContent = hasFilters ? "Charts reflect your active feed filters." : "";

  const COLORS = ["#4a9eff", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  const axisOpts = {
    x: { ticks: { color: "#7a7e87" }, grid: { color: "rgba(255,255,255,0.04)" } },
    y: { ticks: { color: "#7a7e87" }, grid: { color: "rgba(255,255,255,0.04)" } },
  };

  document.getElementById("analytics-panel").innerHTML = `
    <div class="chart-grid">
      <div class="chart-section">
        <h3>Engagement by Hook Style</h3>
        <canvas id="chart-hook" height="220"></canvas>
      </div>
      <div class="chart-section">
        <h3>Content Type Mix</h3>
        <canvas id="chart-content" height="220"></canvas>
      </div>
    </div>
    <div class="chart-grid">
      <div class="chart-section">
        <h3>Industry Breakdown</h3>
        <canvas id="chart-industry" height="220"></canvas>
      </div>
      <div class="chart-section">
        <h3>Harvest Trend</h3>
        <div class="trend-toggle">
          ${[7, 30, 90].map((d) => `<button class="trend-btn ${d === trendDays ? "active" : ""}" onclick="setTrendDays(${d})">${d}d</button>`).join("")}
        </div>
        <canvas id="chart-trend" height="180"></canvas>
      </div>
    </div>
    <div style="margin-top:16px;">
      <button class="save-btn" onclick="analyzeAll()">Analyze All Unprocessed Posts</button>
    </div>
  `;

  if (data.engagement_by_hook.length) {
    chartInstances.hook = new Chart(document.getElementById("chart-hook").getContext("2d"), {
      type: "bar",
      data: { labels: data.engagement_by_hook.map((r) => r.label), datasets: [{ label: "Avg Likes", data: data.engagement_by_hook.map((r) => r.avg_likes), backgroundColor: COLORS[0], borderRadius: 4 }] },
      options: { responsive: true, indexAxis: "y", plugins: { legend: { display: false } }, scales: axisOpts },
    });
  }

  if (data.content_type_mix.length) {
    chartInstances.content = new Chart(document.getElementById("chart-content").getContext("2d"), {
      type: "doughnut",
      data: { labels: data.content_type_mix.map((r) => r.label), datasets: [{ data: data.content_type_mix.map((r) => r.count), backgroundColor: COLORS, borderWidth: 0 }] },
      options: { responsive: true, plugins: { legend: { position: "right", labels: { color: "#e4e6ea", font: { size: 11 }, padding: 8 } } } },
    });
  }

  if (data.industry_breakdown.length) {
    chartInstances.industry = new Chart(document.getElementById("chart-industry").getContext("2d"), {
      type: "bar",
      data: { labels: data.industry_breakdown.map((r) => r.label), datasets: [{ label: "Posts", data: data.industry_breakdown.map((r) => r.count), backgroundColor: COLORS[1], borderRadius: 4 }] },
      options: { responsive: true, indexAxis: "y", plugins: { legend: { display: false } }, scales: axisOpts },
    });
  }

  if (data.harvest_trend.length) {
    chartInstances.trend = new Chart(document.getElementById("chart-trend").getContext("2d"), {
      type: "line",
      data: { labels: data.harvest_trend.map((r) => r.date), datasets: [{ label: "Posts", data: data.harvest_trend.map((r) => r.count), borderColor: COLORS[0], backgroundColor: "rgba(74,158,255,0.1)", fill: true, tension: 0.3, pointRadius: 3 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: axisOpts },
    });
  }
}

function setTrendDays(days) {
  trendDays = days;
  loadAnalytics();
}

async function analyzeAll() {
  const data = await (await fetch(`${API}/api/analyze-all`, { method: "POST" })).json();
  alert(`Queued ${data.count} posts for analysis. Refresh in a moment to see results.`);
}

// ── Export ──

document.getElementById("export-scope").addEventListener("change", (e) => {
  document.getElementById("export-date-range").hidden = e.target.value !== "date";
  refreshExportPreview();
});

async function refreshExportPreview() {
  const params = exportParams();
  params.set("limit", "1");
  params.set("offset", "0");
  const data = await (await fetch(`${API}/api/posts?${params}`)).json();
  document.getElementById("export-preview").textContent = `${data.total} post${data.total !== 1 ? "s" : ""} will be exported`;
}

function exportParams() {
  const scope = document.getElementById("export-scope").value;
  if (scope === "all") return new URLSearchParams();
  if (scope === "filtered") return buildFilterParams();
  const p = new URLSearchParams();
  const from = document.getElementById("export-date-from").value;
  const to = document.getElementById("export-date-to").value;
  if (from) p.set("date_from", from);
  if (to) p.set("date_to", to);
  return p;
}

function doExport(format) {
  const params = exportParams();
  params.set("format", format);
  const a = document.createElement("a");
  a.href = `${API}/api/posts/export?${params}`;
  a.download = format === "llm" ? "postharvest-llm.json" : `postharvest-export.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ── Helpers ──

function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(Math.round(n));
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Init ──
initCategories().then(() => loadFeed(false));
