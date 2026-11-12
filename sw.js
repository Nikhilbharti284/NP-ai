/* ============================================================================
 * AGI Astra Ultra v5.0 — Production Service Worker (sw.js)
 * ============================================================================ */

const CACHE_VERSION = "agi-astra-ultra-v5.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

const CDN_ASSETS = [
  "https://js.puter.com/v2/",
  "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/contrib/auto-render.min.js"
];

const BYPASS_HOSTS = [
  "127.0.0.1",
  "localhost",
  "generativelanguage.googleapis.com",
  "aiplatform.googleapis.com",
  "api.puter.com",
  "puter.site",
  "pollinations.ai",
  "text.pollinations.ai",
  "image.pollinations.ai",
  "emkc.org",
  "open-meteo.com",
  "coingecko.com",
  "mymemory.translated.net",
  "openlibrary.org",
  "dictionaryapi.dev",
  "restcountries.com",
  "r.jina.ai",
  "wikipedia.org",
  "algolia.com",
  "reddit.com",
  "archive.org",
  "arxiv.org",
  "dns.google",
  "crt.sh",
  "rdap.org",
  "ipwho.is",
  "shodan.io",
  "urlscan.io",
  "api.github.com",
  "registry.npmjs.org",
  "pypi.org",
  "stackexchange.com",
  "mozilla.org",
  "nist.gov",
  "osv.dev",
  "frankfurter.app",
  "ssllabs.com",
  "securityheaders.com",
  "rss2json.com"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(APP_SHELL);

      const cdnCache = await caches.open(CDN_CACHE);
      await Promise.allSettled(
        CDN_ASSETS.map((url) =>
          fetch(url, { mode: "cors" })
            .then((res) => {
              if (res.ok) return cdnCache.put(url, res);
            })
            .catch(() => {})
        )
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== CDN_CACHE) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith("http")) return;

  if (BYPASS_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith("." + host))) {
    return;
  }

  if (
    url.hostname.includes("cdnjs.cloudflare.com") ||
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("js.puter.com")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CDN_CACHE);
        const cached = await cache.match(req);
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await networkFetch) || new Response("", { status: 504 });
      })()
    );
    return;
  }

  if (req.mode === "navigate" || url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
          return fresh;
        } catch (err) {
          return (
            (await cache.match(req)) ||
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            new Response("Offline — Reconnect to use Cloud AI.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            })
          );
        }
      })()
    );
  }
});
