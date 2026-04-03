const API = "";
let allCategories = [];

// ─── SVG Icons (matching Twitter's) ───

const ICONS = {
  reply: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"/></svg>',
  retweet: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2h3v2h-3c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H13V4h3.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>',
  like: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.45-4.55-.782-6.14.647-1.53 1.986-2.66 3.819-3.05 1.023-.22 2.149-.12 3.242.34.91.38 1.738.98 2.449 1.78.076.09.255.09.331 0 .711-.8 1.539-1.4 2.449-1.78 1.093-.46 2.219-.56 3.242-.34 1.833.39 3.172 1.52 3.819 3.05.668 1.59.578 3.64-.782 6.14z"/></svg>',
  views: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.75 21V3h2v18h-2zM18.75 21V8.5h2V21h-2zM13.75 21v-6h2v6h-2zM3.75 21v-3h2v3h-2z"/></svg>',
};

// ─── Navigation ───

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
  document.querySelectorAll("[data-view]").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === name);
  });
  if (name === "feed") loadFeed();
  if (name === "categories") loadCategories();
  if (name === "analytics") loadAnalytics();
}

// ─── Feed ───

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

function getInitial(name, handle) {
  if (name) return name.charAt(0).toUpperCase();
  if (handle) return handle.replace("@", "").charAt(0).toUpperCase();
  return "?";
}

function timeSince(iso) {
  if (!iso) return "";
  const seconds = Math.floor((new Date() - new Date(iso)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function loadFeed() {
  const params = new URLSearchParams();
  if (searchInput.value) params.set("q", searchInput.value);
  if (filterAuthor.value) params.set("author", filterAuthor.value);
  if (filterTag.value) params.set("tag", filterTag.value);

  const resp = await fetch(`${API}/api/posts?${params}`);
  const data = await resp.json();

  document.getElementById("posts-list").innerHTML = data.posts.map((p) => `
    <div class="tweet" onclick="loadPostDetail(${p.id})">
      <div class="tweet-avatar">${getInitial(p.author_name, p.author_handle)}</div>
      <div class="tweet-body">
        <div class="tweet-header">
          <span class="tweet-name">${esc(p.author_name || p.author_handle)}</span>
          <span class="tweet-handle">${esc(p.author_handle)}</span>
          <span class="tweet-sep">&middot;</span>
          <span class="tweet-time">${timeSince(p.saved_at)}</span>
        </div>
        <div class="tweet-text">${esc(p.text)}</div>
        ${p.media.length ? `<div class="tweet-media">${p.media.filter((m) => m.type === "image").slice(0, 2).map((m) => `<img src="${API}/api/posts/${p.id}/media/${esc(m.filename)}" alt="" loading="lazy">`).join("")}</div>` : ""}
        ${p.tags.length ? `<div class="tweet-tags">${p.tags.map((t) => `<span class="tag-pill">${esc(t.tag)}</span>`).join("")}</div>` : ""}
        <div class="tweet-actions">
          <div class="tweet-action replies">${ICONS.reply}<span>${fmtNum(p.replies)}</span></div>
          <div class="tweet-action retweets">${ICONS.retweet}<span>${fmtNum(p.retweets)}</span></div>
          <div class="tweet-action likes">${ICONS.like}<span>${fmtNum(p.likes)}</span></div>
          <div class="tweet-action views">${ICONS.views}<span>${fmtNum(p.views)}</span></div>
        </div>
      </div>
    </div>
  `).join("");

  populateFilters(data.posts);
}

function populateFilters(posts) {
  const authors = [...new Set(posts.map((p) => p.author_handle))].sort();
  const currentAuthor = filterAuthor.value;
  filterAuthor.innerHTML = '<option value="">All authors</option>' +
    authors.map((a) => `<option value="${esc(a)}" ${a === currentAuthor ? "selected" : ""}>${esc(a)}</option>`).join("");

  fetch(`${API}/api/tags`).then((r) => r.json()).then((tags) => {
    const currentTag = filterTag.value;
    filterTag.innerHTML = '<option value="">All tags</option>' +
      tags.map((t) => `<option value="${esc(t)}" ${t === currentTag ? "selected" : ""}>${esc(t)}</option>`).join("");
  });
}

// ─── Post Detail ───

async function loadPostDetail(postId) {
  const resp = await fetch(`${API}/api/posts/${postId}`);
  const post = await resp.json();

  if (!allCategories.length) {
    const catResp = await fetch(`${API}/api/categories`);
    allCategories = await catResp.json();
  }

  const detail = document.getElementById("post-detail");
  detail.innerHTML = `
    <div class="detail-tweet">
      <div class="tweet-header" style="gap:8px;">
        <div class="tweet-avatar" style="width:48px;height:48px;font-size:20px;">${getInitial(post.author_name, post.author_handle)}</div>
        <div>
          <div class="tweet-name">${esc(post.author_name || post.author_handle)}</div>
          <div class="tweet-handle">${esc(post.author_handle)}</div>
        </div>
      </div>
      <div class="tweet-text">${esc(post.text)}</div>
      ${post.media.length ? `<div class="tweet-media">${post.media.map((m) => m.type === "image" ? `<img src="${API}/api/posts/${post.id}/media/${esc(m.filename)}" alt="">` : `<video src="${API}/api/posts/${post.id}/media/${esc(m.filename)}" controls style="width:100%;border-radius:16px;"></video>`).join("")}</div>` : ""}
      <div class="tweet-time-full">${formatDateFull(post.posted_at)} &middot; Saved ${formatDateFull(post.saved_at)}</div>
      <div class="detail-metrics">
        <div><strong>${fmtNum(post.retweets)}</strong> <span>Reposts</span></div>
        <div><strong>${fmtNum(post.likes)}</strong> <span>Likes</span></div>
        <div><strong>${fmtNum(post.views)}</strong> <span>Views</span></div>
        <div><strong>${fmtNum(post.replies)}</strong> <span>Replies</span></div>
      </div>
      <div class="detail-link">
        <a href="${esc(post.url)}" target="_blank">View original on X &rarr;</a>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Notes</div>
        <textarea class="detail-textarea" id="detail-notes" placeholder="Add your research notes...">${esc(post.notes)}</textarea>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Tags</div>
        <input class="detail-tags-input" id="detail-tags" placeholder="Comma-separated tags" value="${post.tags.map((t) => t.tag).join(", ")}">
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Categories</div>
        <div id="detail-categories">
          ${allCategories.map((cat) => `
            <div class="cat-group">
              <div class="cat-group-name">${esc(cat.name)}</div>
              <div class="cat-options">
                ${cat.values.map((v) => `
                  <label class="cat-option">
                    <input type="checkbox" value="${v.id}" ${post.categories.some((pc) => pc.id === v.id) ? "checked" : ""}>
                    ${esc(v.value)}
                  </label>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="detail-actions">
        <button class="btn-primary" onclick="savePostUpdate(${post.id})">Save Changes</button>
        <button class="btn-danger" onclick="deletePost(${post.id})">Delete</button>
      </div>
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

// ─── Categories ───

async function loadCategories() {
  const catResp = await fetch(`${API}/api/categories`);
  const cats = await catResp.json();
  allCategories = cats;

  document.getElementById("categories-panel").innerHTML = cats.map((c) => `
    <div class="category-card">
      <h3>${esc(c.name)}</h3>
      <div class="category-values">
        ${c.values.map((v) => `<span class="category-value">${esc(v.value)}</span>`).join("")}
      </div>
    </div>
  `).join("");

  const tagsResp = await fetch(`${API}/api/tags`);
  const tags = await tagsResp.json();
  document.getElementById("tags-cloud").innerHTML = `
    <div class="tags-cloud">
      ${tags.length ? tags.map((t) => `<span class="tag-pill">${esc(t)}</span>`).join("") : '<span style="color:var(--text-secondary);padding:16px;">No tags yet</span>'}
    </div>`;
}

// ─── Analytics ───

async function loadAnalytics() {
  const resp = await fetch(`${API}/api/stats`);
  const stats = await resp.json();

  document.getElementById("analytics-panel").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-number">${stats.total_posts}</div><div class="stat-label">Posts</div></div>
      <div class="stat-card"><div class="stat-number">${stats.total_authors}</div><div class="stat-label">Authors</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_likes)}</div><div class="stat-label">Avg Likes</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_retweets)}</div><div class="stat-label">Avg Reposts</div></div>
      <div class="stat-card"><div class="stat-number">${fmtNum(stats.avg_views)}</div><div class="stat-label">Avg Views</div></div>
      <div class="stat-card"><div class="stat-number">${stats.total_posts ? Math.round(stats.avg_likes / Math.max(stats.avg_views, 1) * 100) + "%" : "0%"}</div><div class="stat-label">Eng. Rate</div></div>
    </div>
    ${stats.top_authors.length ? `
      <div class="analytics-section">
        <h3>Top Authors</h3>
        ${stats.top_authors.map((a) => `
          <div class="analytics-row">
            <span class="analytics-row-label">${esc(a.author_handle)}</span>
            <span class="analytics-row-value">${a.count} posts</span>
          </div>
        `).join("")}
      </div>
    ` : ""}
    ${stats.category_distribution.length ? `
      <div class="analytics-section">
        <h3>Category Breakdown</h3>
        ${stats.category_distribution.map((c) => `
          <div class="analytics-row">
            <span class="analytics-row-label">${esc(c.category)}: ${esc(c.value)}</span>
            <span class="analytics-row-value">${c.count}</span>
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

// ─── Helpers ───

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

function formatDateFull(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    hour: "numeric", minute: "2-digit",
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Init ───
loadFeed();
