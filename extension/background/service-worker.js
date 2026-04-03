const API_BASE = "http://localhost:8688";

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "check-health") {
    fetch(`${API_BASE}/api/health`)
      .then((resp) => resp.json())
      .then((data) => sendResponse({ connected: true, status: data.status }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }

  if (message.type === "save-post") {
    fetch(`${API_BASE}/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.data),
    })
      .then((resp) => {
        const status = resp.status;
        return resp.json().then((data) => sendResponse({ ok: status === 201, status: status, data: data }));
      })
      .catch(() => sendResponse(null));
    return true;
  }

  if (message.type === "get-stats") {
    fetch(`${API_BASE}/api/stats`)
      .then((resp) => resp.json())
      .then((data) => sendResponse({ ok: true, stats: data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});
