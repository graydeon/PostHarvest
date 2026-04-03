const API = "";
let allCategories = [];
let chartInstances = {};

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
  document.querySelectorAll("[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === name));

  if (name === "feed") loadFeed();
  if (name === "categories") loadCategories();
  if (name === "analytics") loadAnalytics();
}

// ── Feed ──

const searchInput = document.getElementById("search-input");
const filterAuthor = document.getElementById("filter-author");
const filterTag = document.getElementById("filter-tag");

let searchTimeout;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadFeed, 300);
});
filterAuthor.addEventListener("change", loadFeed);
filterTag.addEventListener("change", loadFeed);

function sentimentBadge(label) {
  if (!label) return "";
  const colors = { positive: "#22c55e", negative: "#ef4444", neutral: "#71767b" };
  return `<span class="sentiment-badge" style="color:${colors[label] || colors.neutral}">${label}</span>`;
}

async function loadFeed() {
  const params = new URLSearchParams();
  if (searchInput.value) params.set("q", searchInput.value);
  if (filterAuthor.value) params.set("author", filterAuthor.value);
  if (filterTag.value) params.set("tag", filterTag.value);

  const resp = await fetch(`${API}/api/posts?${params}`);
  const data = await resp.json();

  const list = document.getElementById("posts-list");
  list.innerHTML = data.posts
    .map(
      (p) => `
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
  `
    )
    .join("");

  populateFilters(data.posts);
}

function populateFilters(posts) {
  const authors = [...new Set(posts.map((p) => p.author_handle))].sort();
  const currentAuthor = filterAuthor.value;
  filterAuthor.innerHTML = '<option value="">All Authors</option>' + authors.map((a) => `<option value="${esc(a)}" ${a === currentAuthor ? "selected" : ""}>${esc(a)}</option>`).join("");

  fetch(`${API}/api/tags`).then((r) => r.json()).then((tags) => {
    const currentTag = filterTag.value;
    filterTag.innerHTML = '<option value="">All Tags</option>' + tags.map((t) => `<option value="${esc(t)}" ${t === currentTag ? "selected" : ""}>${esc(t)}</option>`).join("");
  });
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

  const entityColors = { PERSON: "#8b5cf6", ORG: "#3b82f6", PRODUCT: "#f59e0b", GPE: "#10b981", MONEY: "#22c55e", EVENT: "#ec4899", WORK_OF_ART: "#f97316" };

  const detail = document.getElementById("post-detail");
  detail.innerHTML = `
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
  const tagsRaw = document.getElementById("detail-tags").value;
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
  const checkboxes = document.querySelectorAll("#detail-categories input[type=checkbox]:checked");
  const categoryValueIds = [...checkboxes].map((cb) => parseInt(cb.value));

  await fetch(`${API}/api/posts/${postId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes, tags, category_value_ids: categoryValueIds }),
  });

  loadPostDetail(postId);
}

// ── Categories ──

async function loadCategories() {
  const catResp = await fetch(`${API}/api/categories`);
  const cats = await catResp.json();
  allCategories = cats;

  document.getElementById("categories-panel").innerHTML = cats
    .map((c) => `
    <div class="category-card">
      <h3>${esc(c.name)}</h3>
      <div class="category-values">
        ${c.values.map((v) => `<span class="category-value">${esc(v.value)}</span>`).join("")}
      </div>
    </div>
  `).join("");

  const tagsResp = await fetch(`${API}/api/tags`);
  const tags = await tagsResp.json();
  document.getElementById("tags-cloud").innerHTML = `<div class="tags-cloud">${tags.map((t) => `<span class="tag-badge">${esc(t)}</span>`).join("")}</div>`;
}

// ── Analytics (Chart.js) ──

function destroyCharts() {
  Object.values(chartInstances).forEach((c) => c.destroy());
  chartInstances = {};
}

async function loadAnalytics() {
  destroyCharts();

  const [statsResp, clustersResp] = await Promise.all([
    fetch(`${API}/api/stats`),
    fetch(`${API}/api/clusters`).catch(() => null),
  ]);

  const stats = await statsResp.json();
  const clustersData = clustersResp && clustersResp.ok ? await clustersResp.json() : { clusters: [] };

  const panel = document.getElementById("analytics-panel");
  panel.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${stats.total_posts}</div><div class="stat-label">Total Posts</div></div>
      <div class="stat-card"><div class="stat-number">${stats.total_authors}</div><div class="stat-label">Authors</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_likes)}</div><div class="stat-label">Avg Likes</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_retweets)}</div><div class="stat-label">Avg Retweets</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_views)}</div><div class="stat-label">Avg Views</div></div>
    </div>

    ${stats.top_authors.length ? `
      <div class="chart-section">
        <h3>Top Authors</h3>
        <canvas id="chart-authors" height="200"></canvas>
      </div>
    ` : ""}

    ${stats.category_distribution.length ? `
      <div class="chart-section">
        <h3>Category Breakdown</h3>
        <canvas id="chart-categories" height="200"></canvas>
      </div>
    ` : ""}

    ${clustersData.clusters.length ? `
      <div class="chart-section">
        <h3>Content Clusters</h3>
        <div class="clusters-list">
          ${clustersData.clusters.map((c, i) => `
            <div class="cluster-card">
              <div class="cluster-header">Cluster ${i + 1} <span style="color:var(--text-dim)">(${c.posts.length} posts)</span></div>
              ${c.posts.slice(0, 3).map((p) => `
                <div class="cluster-post" onclick="loadPostDetail(${p.post_id})">
                  <span style="color:var(--text-dim);font-size:11px;">${esc(p.author_handle)}</span>
                  <span style="font-size:12px;">${esc(p.text)}</span>
                </div>
              `).join("")}
              ${c.posts.length > 3 ? `<div style="color:var(--text-dim);font-size:11px;padding:4px 0;">+${c.posts.length - 3} more</div>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}

    <div style="margin-top:16px;">
      <button class="save-btn" onclick="analyzeAll()">Analyze All Unprocessed Posts</button>
    </div>
  `;

  // Render charts
  if (stats.top_authors.length && document.getElementById("chart-authors")) {
    const ctx = document.getElementById("chart-authors").getContext("2d");
    chartInstances.authors = new Chart(ctx, {
      type: "bar",
      data: {
        labels: stats.top_authors.map((a) => a.author_handle),
        datasets: [{
          label: "Posts",
          data: stats.top_authors.map((a) => a.count),
          backgroundColor: "rgba(74, 158, 255, 0.6)",
          borderColor: "rgba(74, 158, 255, 1)",
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#7a7e87" }, grid: { color: "rgba(255,255,255,0.04)" } },
          y: { ticks: { color: "#e4e6ea", font: { size: 12 } }, grid: { display: false } },
        },
      },
    });
  }

  if (stats.category_distribution.length && document.getElementById("chart-categories")) {
    const colors = ["#4a9eff", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
    const ctx = document.getElementById("chart-categories").getContext("2d");
    chartInstances.categories = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: stats.category_distribution.map((c) => `${c.category}: ${c.value}`),
        datasets: [{
          data: stats.category_distribution.map((c) => c.count),
          backgroundColor: stats.category_distribution.map((_, i) => colors[i % colors.length]),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "right",
            labels: { color: "#e4e6ea", font: { size: 12 }, padding: 8 },
          },
        },
      },
    });
  }
}

async function analyzeAll() {
  const resp = await fetch(`${API}/api/analyze-all`, { method: "POST" });
  const data = await resp.json();
  alert(`Queued ${data.count} posts for analysis. Refresh in a moment to see results.`);
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
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

loadFeed();
