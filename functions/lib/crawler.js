const DEFAULT_MAX_PAGES = 30;
const MAX_MAX_PAGES = 50;
const FETCH_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 2_000_000;

export async function crawlWebsite(inputUrl, options = {}) {
  const startUrl = normalizeStartUrl(inputUrl);
  const maxPages = clampNumber(
    options.maxPages,
    1,
    MAX_MAX_PAGES,
    DEFAULT_MAX_PAGES
  );

  const start = new URL(startUrl);
  const origin = start.origin;
  const hostname = start.hostname;

  const robots = await fetchRobots(origin);
  const sitemap = await fetchSitemap(origin, robots.sitemaps);

  const sitemapUrls = sitemap.urls.filter((url) =>
    sameHostname(url, hostname)
  );

  const queue = uniqueQueue([
    startUrl,
    ...sitemapUrls,
  ]);

  const visited = new Set();
  const pages = [];
  const discoveredLinks = [];
  const errors = [];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();

    if (visited.has(url)) continue;

    visited.add(url);

    if (!sameHostname(url, hostname)) continue;
    if (!isHttpUrl(url)) continue;
    if (isProbablyNonHtml(url)) continue;

    try {
      const page = await fetchPage(url);

      pages.push(page);

      for (const link of page.internalLinks || []) {
        discoveredLinks.push({
          from: page.url,
          to: link,
        });

        if (
          !visited.has(link) &&
          !queue.includes(link) &&
          pages.length + queue.length < maxPages * 3
        ) {
          queue.push(link);
        }
      }
    } catch (error) {
      errors.push({
        url,
        error: error?.message || String(error),
      });
    }
  }

  const crawledPages = new Map(
    pages.map((page) => [page.url, page])
  );

  const brokenInternalLinks = [];

  for (const item of discoveredLinks) {
    const target = crawledPages.get(item.to);

    if (target && target.status >= 400) {
      brokenInternalLinks.push({
        from: item.from,
        to: item.to,
        status: target.status,
      });
    }
  }

  const collectedAt = new Date().toISOString();

  return {
    crawl: {
      startUrl,
      origin,
      hostname,
      maxPages,
      pagesCrawled: pages.length,
      collectedAt,
    },

    robots,

    sitemap: {
      found: sitemap.found,
      url: sitemap.url,
      urlsDiscovered: sitemapUrls.length,
      urls: sitemapUrls.slice(0, 200),
    },

    pages,

    brokenInternalLinks,

    errors,

    evidence: {
      source: "live website crawl",
      collectedAt,
      pagesCrawled: pages.length,
      note:
        "Findings in this dataset are based on pages actually fetched during this crawl.",
    },
  };
}

async function fetchPage(url) {
  const started = Date.now();

  let currentUrl = url;
  const redirects = [];
  let response = null;

  for (let i = 0; i < 6; i++) {
    response = await fetchWithTimeout(currentUrl, {
      redirect: "manual",

      headers: {
        "User-Agent": "SEO-AI-Agent-Crawler/1.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (response.status < 300 || response.status >= 400) {
      break;
    }

    const location = response.headers.get("Location");

    if (!location) {
      break;
    }

    const nextUrl = new URL(location, currentUrl).href;

    redirects.push({
      from: currentUrl,
      to: nextUrl,
      status: response.status,
    });

    currentUrl = stripHash(nextUrl);
  }

  if (!response) {
    throw new Error("No response received.");
  }

  const contentType =
    response.headers.get("content-type") || "";

  const finalUrl = stripHash(currentUrl);
  const status = response.status;

  const headers = Object.fromEntries(
    response.headers.entries()
  );

  const contentLengthHeader =
    response.headers.get("content-length");

  if (
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml")
  ) {
    return basePage(
      finalUrl,
      status,
      started,
      redirects,
      contentType,
      headers,
      Number(contentLengthHeader) || 0
    );
  }

  const buffer = await response.arrayBuffer();

  const bytes = buffer.byteLength;
  const truncated = bytes > MAX_BODY_BYTES;

  const html = new TextDecoder().decode(
    truncated
      ? buffer.slice(0, MAX_BODY_BYTES)
      : buffer
  );

  const parsed = parseHtml(html, finalUrl);

  return {
    ...basePage(
      finalUrl,
      status,
      started,
      redirects,
      contentType,
      headers,
      bytes
    ),

    truncated,

    ...parsed,
  };
}

function parseHtml(html, pageUrl) {
  const title = firstMatch(
    html,
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  const metaDescription = firstMeta(
    html,
    "description"
  );

  const robotsMeta = firstMeta(
    html,
    "robots"
  );

  const canonical = firstLink(
    html,
    "canonical",
    pageUrl
  );

  const viewport = firstMeta(
    html,
    "viewport"
  );

  const charset =
    /<meta[^>]+charset\s*=\s*["']?([^\s"'>]+)/i.exec(
      html
    )?.[1] || null;

  const headings = {};

  for (let level = 1; level <= 6; level++) {
    headings[`h${level}`] = allMatches(
      html,
      new RegExp(
        `<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`,
        "gi"
      ),
      100
    ).map(cleanText);
  }

  const links = allMatches(
    html,
    /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi,
    500
  )
    .map((href) => resolveUrl(href, pageUrl))
    .filter(Boolean);

  const pageHostname = new URL(pageUrl).hostname;

  const internalLinks = unique(
    links.filter((url) =>
      sameHostname(url, pageHostname)
    )
  );

  const externalLinks = unique(
    links.filter(
      (url) =>
        !sameHostname(url, pageHostname)
    )
  );

  const images = allMatches(
    html,
    /<img\b([^>]*)>/gi,
    500
  ).map((attrs) => {
    const src = attribute(attrs, "src");
    const alt = attribute(attrs, "alt");

    return {
      src,
      alt,
      hasAlt: alt !== null,
    };
  });

  const scriptsWithJsonLd = allMatches(
    html,
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    50
  )
    .map((x) => x.trim())
    .filter(Boolean);

  const text = cleanText(
    html
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<!--[\s\S]*?-->/g,
        " "
      )
  );

  const wordCount = text
    ? text.split(/\s+/).filter(Boolean).length
    : 0;

  return {
    title: title ? cleanText(title) : null,

    titleLength: title
      ? cleanText(title).length
      : 0,

    metaDescription: metaDescription
      ? cleanText(metaDescription)
      : null,

    metaDescriptionLength: metaDescription
      ? cleanText(metaDescription).length
      : 0,

    canonical,

    robotsMeta: robotsMeta
      ? cleanText(robotsMeta)
      : null,

    noindex:
      /(?:^|[,\s])noindex(?:$|[,\s])/i.test(
        robotsMeta || ""
      ),

    viewport: viewport
      ? cleanText(viewport)
      : null,

    charset,

    headings,

    h1Count: headings.h1.length,

    internalLinks,

    internalLinkCount: internalLinks.length,

    externalLinks,

    externalLinkCount: externalLinks.length,

    images,

    imageCount: images.length,

    imagesWithoutAlt: images.filter(
      (image) => !image.hasAlt
    ).length,

    structuredData: scriptsWithJsonLd,

    structuredDataCount:
      scriptsWithJsonLd.length,

    wordCount,
  };
}

function basePage(
  url,
  status,
  started,
  redirects,
  contentType,
  headers,
  bytes
) {
  return {
    url,

    status,

    ok:
      status >= 200 &&
      status < 400,

    finalUrl: url,

    redirectCount:
      redirects.length,

    redirects,

    contentType,

    contentLength: bytes,

    responseTimeMs:
      Date.now() - started,

    cacheControl:
      headers["cache-control"] || null,

    server:
      headers["server"] || null,
  };
}

async function fetchRobots(origin) {
  const url = `${origin}/robots.txt`;

  try {
    const response =
      await fetchWithTimeout(url, {
        headers: {
          "User-Agent":
            "SEO-AI-Agent-Crawler/1.0",
        },
      });

    const text = await response.text();

    const sitemaps =
      text
        .match(
          /^\s*Sitemap:\s*(\S+)/gim
        )
        ?.map((line) =>
          line
            .replace(
              /^\s*Sitemap:\s*/i,
              ""
            )
            .trim()
        ) || [];

    return {
      found: response.ok,
      status: response.status,
      url,
      sitemaps,
      content: text.slice(0, 50000),
    };
  } catch (error) {
    return {
      found: false,
      status: null,
      url,
      sitemaps: [],
      error:
        error?.message ||
        String(error),
    };
  }
}

async function fetchSitemap(
  origin,
  sitemapHints = []
) {
  const candidates = unique([
    ...sitemapHints,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ]);

  for (const url of candidates) {
    try {
      const response =
        await fetchWithTimeout(url, {
          headers: {
            "User-Agent":
              "SEO-AI-Agent-Crawler/1.0",
          },
        });

      if (!response.ok) {
        continue;
      }

      const xml = await response.text();

      const urls = allMatches(
        xml,
        /<loc>\s*([^<]+?)\s*<\/loc>/gi,
        1000
      )
        .map((x) =>
          stripHash(x.trim())
        )
        .filter(isHttpUrl);

      return {
        found: true,
        url,
        urls,
      };
    } catch {
      // Try next sitemap candidate.
    }
  }

  return {
    found: false,
    url: null,
    urls: [],
  };
}

function normalizeStartUrl(input) {
  const raw = String(input || "").trim();

  if (!raw) {
    throw new Error(
      "Website URL is required."
    );
  }

  const withProtocol =
    /^https?:\/\//i.test(raw)
      ? raw
      : `https://${raw}`;

  const url = new URL(withProtocol);

  if (!isHttpUrl(url.href)) {
    throw new Error(
      "Website URL must use HTTP or HTTPS."
    );
  }

  url.hash = "";
  url.search = "";

  return stripTrailingSlash(
    url.href
  );
}

async function fetchWithTimeout(
  url,
  init = {}
) {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () =>
      controller.abort(),
    FETCH_TIMEOUT_MS
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        `Request timed out after ${FETCH_TIMEOUT_MS}ms.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function firstMeta(html, name) {
  const escaped =
    escapeRegex(name);

  const re = new RegExp(
    `<meta\\b[^>]*(?:name|property)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
    "i"
  );

  const altRe = new RegExp(
    `<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${escaped}["'][^>]*>`,
    "i"
  );

  return (
    re.exec(html)?.[1] ||
    altRe.exec(html)?.[1] ||
    null
  );
}

function firstLink(
  html,
  rel,
  baseUrl
) {
  const escaped =
    escapeRegex(rel);

  const match =
    new RegExp(
      `<link\\b[^>]*rel\\s*=\\s*["']${escaped}["'][^>]*href\\s*=\\s*["']([^"']+)["'][^>]*>`,
      "i"
    ).exec(html) ||
    new RegExp(
      `<link\\b[^>]*href\\s*=\\s*["']([^"']+)["'][^>]*rel\\s*=\\s*["']${escaped}["'][^>]*>`,
      "i"
    ).exec(html);

  return match
    ? resolveUrl(
        match[1],
        baseUrl
      )
    : null;
}

function attribute(
  attrs,
  name
) {
  return (
    new RegExp(
      `${escapeRegex(name)}\\s*=\\s*["']([^"']*)["']`,
      "i"
    ).exec(attrs)?.[1] ??
    null
  );
}

function resolveUrl(
  value,
  baseUrl
) {
  try {
    const url = new URL(
      value,
      baseUrl
    );

    if (!isHttpUrl(url.href)) {
      return null;
    }

    url.hash = "";

    return normalizeUrl(url.href);
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  const parsed = new URL(url);

  parsed.hash = "";

  return stripTrailingSlash(
    parsed.href
  );
}

function stripHash(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    return parsed.href;
  } catch {
    return url;
  }
}

function stripTrailingSlash(url) {
  return url.endsWith("/")
    ? url.slice(0, -1)
    : url;
}

function sameHostname(
  url,
  hostname
) {
  try {
    return (
      new URL(url)
        .hostname
        .toLowerCase() ===
      hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(
    String(url)
  );
}

function isProbablyNonHtml(url) {
  try {
    const pathname =
      new URL(url).pathname.toLowerCase();

    return /\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|css|js|json|xml|zip|mp4|mp3|woff|woff2|ttf|eot)$/i.test(
      pathname
    );
  } catch {
    return true;
  }
}

function firstMatch(
  html,
  regex
) {
  return regex.exec(html)?.[1] || null;
}

function allMatches(
  html,
  regex,
  limit = 100
) {
  const output = [];
  let match;

  while (
    (match = regex.exec(html)) !==
      null &&
    output.length < limit
  ) {
    output.push(
      match[1] ?? ""
    );
  }

  return output;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function unique(items) {
  return [
    ...new Set(
      items.filter(Boolean)
    ),
  ];
}

function uniqueQueue(items) {
  return unique(
    items.map((item) =>
      normalizeUrl(item)
    )
  );
}

function clampNumber(
  value,
  min,
  max,
  fallback
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      Math.floor(number)
    )
  );
}

function escapeRegex(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}
