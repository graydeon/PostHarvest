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

  // ── Detect if we're on a single-post/article page ──

  function isArticlePage() {
    return /\/status\/\d+/.test(window.location.pathname);
  }

  // ── Scrape the full article body from an article detail page ──
  // X renders long-form articles in a separate container below the tweet header.
  // We look for the article content area which contains the rendered rich text.

  function scrapeArticleBody() {
    // X long-form articles use these specific data-testid attributes:
    // - twitterArticleRichTextView: the rich text content of the article
    // - longformRichTextComponent: the inner rich text component
    // - twitterArticleReadView: the full article read view container

    // Try most specific first
    const richText = document.querySelector('[data-testid="twitterArticleRichTextView"]')
      || document.querySelector('[data-testid="longformRichTextComponent"]');
    if (richText) {
      return richText.innerText.trim();
    }

    // Fallback: the full read view container (includes some chrome but has all text)
    const readView = document.querySelector('[data-testid="twitterArticleReadView"]');
    if (readView) {
      return readView.innerText.trim();
    }

    return "";
  }

  // ── Standard tweet scraper ──

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

    // Grab all tweetText elements within this article
    const textEls = article.querySelectorAll('[data-testid="tweetText"]');
    let text = Array.from(textEls).map((el) => el.innerText).join("\n\n");

    // Check for article/note card
    const cardEl = article.querySelector('[data-testid="card.wrapper"]');
    if (cardEl) {
      const cardText = cardEl.innerText.trim();
      if (cardText && !text.includes(cardText)) {
        text = text ? text + "\n\n" + cardText : cardText;
      }
    }

    // If we're on an article page, grab the full article body
    if (isArticlePage()) {
      const articleBody = scrapeArticleBody();
      if (articleBody && articleBody.length > text.length) {
        text = articleBody;
      }
    }

    // If there's a "Show more" indicator, note truncation
    const showMore = article.querySelector('[data-testid="tweet-text-show-more-link"]');
    if (showMore && !isArticlePage()) {
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

    // Fallback: extract tweet ID from URL if we're on a status page
    if (!tweetId && isArticlePage()) {
      const match = window.location.pathname.match(/\/status\/(\d+)/);
      if (match) {
        tweetId = match[1];
        url = "https://x.com" + window.location.pathname;
      }
    }

    // Scrape engagement — check the article first, then page-level action bars
    let replies = 0, retweets = 0, likes = 0, views = 0;
    const actionBar = article.querySelector('[role="group"]');
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
    // Look for images in the article and also on the page if we're in article view
    const searchRoot = isArticlePage() ? document : article;
    const images = searchRoot.querySelectorAll('[data-testid="tweetPhoto"] img');
    for (const img of images) {
      const src = img.getAttribute("src");
      if (src && src.includes("pbs.twimg.com")) {
        const highRes = src.replace(/&name=\w+/, "&name=large");
        if (!mediaUrls.some((m) => m.url === highRes)) {
          mediaUrls.push({ url: highRes, type: "image" });
        }
      }
    }
    const videos = searchRoot.querySelectorAll("video");
    for (const video of videos) {
      const src = video.getAttribute("src") || video.querySelector("source")?.getAttribute("src");
      if (src && !mediaUrls.some((m) => m.url === src)) {
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

  // ── Save handler ──

  async function saveTweet(article, btn) {
    btn.classList.add("saving");
    const data = scrapeTweet(article);

    // Debug: log what we scraped to browser console
    console.log("[PostHarvest] Scraped data:", {
      tweet_id: data.tweet_id,
      text_length: data.text.length,
      text_preview: data.text.substring(0, 200),
      media_count: data.media_urls.length,
      isArticlePage: isArticlePage(),
    });

    if (!data.tweet_id) {
      btn.classList.remove("saving");
      btn.classList.add("error");
      btn.title = "Could not extract tweet ID";
      setTimeout(() => btn.classList.remove("error"), 3000);
      return;
    }

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

  // ── Button injection for regular tweets ──

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

  // ── Process and observe ──

  function processAll() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const article of articles) {
      injectButton(article);
    }
  }

  processAll();

  const observer = new MutationObserver(() => {
    processAll();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
