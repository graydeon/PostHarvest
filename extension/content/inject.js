(function () {
  "use strict";

  const PROCESSED_ATTR = "data-postharvest";

  const ICON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5H7.5L12 7l4.5 4.5H13v5h-2z"/>
  </svg>`;

  function createHarvestButton() {
    const btn = document.createElement("button");
    btn.className = "postharvest-btn";
    btn.title = "Save to PostHarvest";
    btn.innerHTML = ICON_SVG;
    btn.setAttribute("aria-label", "Save to PostHarvest");
    return btn;
  }

  function parseEngagementCount(text) {
    if (!text) return 0;
    text = text.trim().replace(/,/g, "");
    if (text.endsWith("K")) return Math.round(parseFloat(text) * 1000);
    if (text.endsWith("M")) return Math.round(parseFloat(text) * 1000000);
    return parseInt(text, 10) || 0;
  }

  function scrapeTweet(article) {
    const userLinks = article.querySelectorAll('a[href^="/"][role="link"]');
    let authorHandle = "";
    let authorName = "";
    for (const link of userLinks) {
      const href = link.getAttribute("href");
      if (href && href.match(/^\/[A-Za-z0-9_]+$/) && !href.includes("/status/")) {
        authorHandle = "@" + href.slice(1);
        const nameSpan = link.querySelector("span");
        if (nameSpan) authorName = nameSpan.textContent.trim();
        break;
      }
    }

    // Grab all tweetText elements — long articles/threads may have multiple
    const textEls = article.querySelectorAll('[data-testid="tweetText"]');
    let text = Array.from(textEls).map((el) => el.innerText).join("\n\n");

    // Check for article/note card — grab its title and preview text too
    const cardEl = article.querySelector('[data-testid="card.wrapper"]');
    if (cardEl) {
      const cardText = cardEl.innerText.trim();
      if (cardText && !text.includes(cardText)) {
        text = text ? text + "\n\n" + cardText : cardText;
      }
    }

    // If there's a "Show more" indicator, note that text may be truncated
    const showMore = article.querySelector('[data-testid="tweet-text-show-more-link"]');
    if (showMore) {
      text = text + "\n\n[Content truncated — view full post on X]";
    }

    const timeEl = article.querySelector("time");
    let url = "";
    let tweetId = "";
    let postedAt = "";
    if (timeEl) {
      const timeLink = timeEl.closest("a");
      if (timeLink) {
        const href = timeLink.getAttribute("href");
        url = "https://x.com" + href;
        const match = href.match(/\/status\/(\d+)/);
        if (match) tweetId = match[1];
      }
      postedAt = timeEl.getAttribute("datetime") || "";
    }

    const actionBar = article.querySelector('[role="group"]');
    let replies = 0, retweets = 0, likes = 0, views = 0;
    if (actionBar) {
      const buttons = actionBar.querySelectorAll('[data-testid]');
      for (const btn of buttons) {
        const testId = btn.getAttribute("data-testid");
        const countEl = btn.querySelector('span[data-testid] span, span');
        const count = countEl ? parseEngagementCount(countEl.textContent) : 0;
        if (testId === "reply") replies = count;
        else if (testId === "retweet") retweets = count;
        else if (testId === "like") likes = count;
      }
      const analyticsLink = article.querySelector('a[href*="/analytics"]');
      if (analyticsLink) {
        const viewSpan = analyticsLink.querySelector("span");
        if (viewSpan) views = parseEngagementCount(viewSpan.textContent);
      }
    }

    const mediaUrls = [];
    const images = article.querySelectorAll('[data-testid="tweetPhoto"] img');
    for (const img of images) {
      const src = img.getAttribute("src");
      if (src && src.includes("pbs.twimg.com")) {
        const highRes = src.replace(/&name=\w+/, "&name=large");
        mediaUrls.push({ url: highRes, type: "image" });
      }
    }
    const videos = article.querySelectorAll("video");
    for (const video of videos) {
      const src = video.getAttribute("src") || video.querySelector("source")?.getAttribute("src");
      if (src) {
        mediaUrls.push({ url: src, type: "video" });
      }
    }

    return {
      tweet_id: tweetId,
      author_handle: authorHandle,
      author_name: authorName,
      text: text,
      url: url,
      posted_at: postedAt,
      likes: likes,
      retweets: retweets,
      replies: replies,
      views: views,
      media_urls: mediaUrls,
    };
  }

  async function saveTweet(article, btn) {
    btn.classList.add("saving");
    const data = scrapeTweet(article);

    if (!data.tweet_id) {
      btn.classList.remove("saving");
      btn.classList.add("error");
      btn.title = "Could not extract tweet ID";
      setTimeout(() => btn.classList.remove("error"), 3000);
      return;
    }

    // Route through background script to avoid CSP/CORS restrictions
    try {
      const resp = await browser.runtime.sendMessage({ type: "save-post", data: data });
      btn.classList.remove("saving");

      if (!resp) {
        btn.classList.add("error");
        btn.title = "Cannot reach PostHarvest backend";
        setTimeout(() => btn.classList.remove("error"), 3000);
        return;
      }

      if (resp.ok) {
        btn.classList.add("saved");
        btn.title = "Saved to PostHarvest";
      } else if (resp.status === 409) {
        btn.classList.add("saved");
        btn.title = "Already saved";
      } else {
        btn.classList.add("error");
        btn.title = "Save failed — is the backend running?";
        setTimeout(() => btn.classList.remove("error"), 3000);
      }
    } catch (err) {
      btn.classList.remove("saving");
      btn.classList.add("error");
      btn.title = "Cannot reach PostHarvest backend";
      setTimeout(() => btn.classList.remove("error"), 3000);
    }
  }

  function injectButton(article) {
    if (article.hasAttribute(PROCESSED_ATTR)) return;
    article.setAttribute(PROCESSED_ATTR, "true");

    const actionBar = article.querySelector('[role="group"]');
    if (!actionBar) return;

    const btn = createHarvestButton();
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      saveTweet(article, btn);
    });

    actionBar.appendChild(btn);
  }

  function processExistingTweets() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const article of articles) {
      injectButton(article);
    }
  }

  processExistingTweets();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches && node.matches('article[data-testid="tweet"]')) {
          injectButton(node);
        }
        const nested = node.querySelectorAll && node.querySelectorAll('article[data-testid="tweet"]');
        if (nested) {
          for (const article of nested) {
            injectButton(article);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
