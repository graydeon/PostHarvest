const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const statsEl = document.getElementById("stats");
const totalPosts = document.getElementById("total-posts");
const dashboardLink = document.getElementById("dashboard-link");

dashboardLink.addEventListener("click", (e) => {
  e.preventDefault();
  browser.tabs.create({ url: dashboardLink.href });
});

async function init() {
  try {
    const resp = await browser.runtime.sendMessage({ type: "check-health" });
    if (resp && resp.connected) {
      statusEl.classList.remove("disconnected");
      statusEl.classList.add("connected");
      statusText.textContent = "Backend connected";

      const statsResp = await browser.runtime.sendMessage({ type: "get-stats" });
      if (statsResp && statsResp.ok) {
        statsEl.classList.remove("hidden");
        totalPosts.textContent = statsResp.stats.total_posts;
      }
    } else {
      statusText.textContent = "Backend offline";
    }
  } catch (err) {
    statusText.textContent = "Backend offline";
  }
}

init();
