const API = "";

let allCategories = [];

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
      ${p.media.length ? `<div class="post-media-thumb">${p.media.filter((m) => m.type === "image").slice(0, 3).map((m) => `<img src="${API}/api/posts/${p.id}/media/${esc(m.filename)}" alt="">`).join("")}</div>` : ""}
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

  fetch(`${API}/api/tags`)
    .then((r) => r.json())
    .then((tags) => {
      const currentTag = filterTag.value;
      filterTag.innerHTML = '<option value="">All Tags</option>' + tags.map((t) => `<option value="${esc(t)}" ${t === currentTag ? "selected" : ""}>${esc(t)}</option>`).join("");
    });
}

async function loadPostDetail(postId) {
  const resp = await fetch(`${API}/api/posts/${postId}`);
  const post = await resp.json();

  if (!allCategories.length) {
    const catResp = await fetch(`${API}/api/categories`);
    allCategories = await catResp.json();
  }

  const detail = document.getElementById("post-detail");
  detail.innerHTML = `
    <div class="post-card-header">
      <div>
        <span class="post-author">${esc(post.author_name)}</span>
        <span class="post-handle">${esc(post.author_handle)}</span>
      </div>
      <a href="${esc(post.url)}" target="_blank" style="color:var(--accent);font-size:13px;">View on X</a>
    </div>
    <div class="detail-text">${esc(post.text)}</div>
    <div class="post-metrics">
      <span class="metric">${fmtNum(post.likes)} likes</span>
      <span class="metric">${fmtNum(post.retweets)} retweets</span>
      <span class="metric">${fmtNum(post.replies)} replies</span>
      <span class="metric">${fmtNum(post.views)} views</span>
    </div>
    ${post.media.length ? `<div class="detail-media">${post.media.map((m) => m.type === "image" ? `<img src="${API}/api/posts/${post.id}/media/${esc(m.filename)}" alt="">` : `<video src="${API}/api/posts/${post.id}/media/${esc(m.filename)}" controls></video>`).join("")}</div>` : ""}
    <h3 style="margin-top:16px;">Notes</h3>
    <div class="detail-notes">
      <textarea id="detail-notes">${esc(post.notes)}</textarea>
    </div>
    <h3 style="margin-top:12px;">Tags</h3>
    <input class="detail-tags-input" id="detail-tags" placeholder="Comma-separated tags" value="${post.tags.map((t) => t.tag).join(", ")}">
    <h3 style="margin-top:12px;">Categories</h3>
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
    <button class="save-btn" onclick="savePostUpdate(${post.id})">Save Changes</button>
  `;

  showView("detail");
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

async function loadCategories() {
  const catResp = await fetch(`${API}/api/categories`);
  const cats = await catResp.json();
  allCategories = cats;

  document.getElementById("categories-panel").innerHTML = cats
    .map(
      (c) => `
    <div class="category-card">
      <h3>${esc(c.name)}</h3>
      <div class="category-values">
        ${c.values.map((v) => `<span class="category-value">${esc(v.value)}</span>`).join("")}
      </div>
    </div>
  `
    )
    .join("");

  const tagsResp = await fetch(`${API}/api/tags`);
  const tags = await tagsResp.json();
  document.getElementById("tags-cloud").innerHTML = `<div class="tags-cloud">${tags.map((t) => `<span class="tag-badge">${esc(t)}</span>`).join("")}</div>`;
}

async function loadAnalytics() {
  const resp = await fetch(`${API}/api/stats`);
  const stats = await resp.json();

  document.getElementById("analytics-panel").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${stats.total_posts}</div><div class="stat-label">Total Posts</div></div>
      <div class="stat-card"><div class="stat-number">${stats.total_authors}</div><div class="stat-label">Authors</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_likes)}</div><div class="stat-label">Avg Likes</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_retweets)}</div><div class="stat-label">Avg Retweets</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_views)}</div><div class="stat-label">Avg Views</div></div>
    </div>
    ${stats.top_authors.length ? `
      <h3>Top Authors</h3>
      <div class="top-authors-list">
        ${stats.top_authors.map((a) => `<div class="top-author-row"><span>${esc(a.author_handle)}</span><span>${a.count} posts</span></div>`).join("")}
      </div>
    ` : ""}
    ${stats.category_distribution.length ? `
      <h3 style="margin-top:16px;">Category Breakdown</h3>
      <div class="top-authors-list">
        ${stats.category_distribution.map((c) => `<div class="top-author-row"><span>${esc(c.category)}: ${esc(c.value)}</span><span>${c.count}</span></div>`).join("")}
      </div>
    ` : ""}
  `;
}

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
