/* ============================================================================
 * Astra X v15.0 — AGI Ecosystem Monochrome Service Worker (sw.js)
 * ============================================================================ */

const CACHE_VERSION = "astra-agi-v15.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

const APP_SHELL = ["./", "./index.html", "./manifest.json"];

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
  "127.0.0.1", "localhost", "generativelanguage.googleapis.com",
  "aiplatform.googleapis.com", "api.puter.com", "puter.site",
  "pollinations.ai", "text.pollinations.ai", "image.pollinations.ai",
  "emkc.org", "r.jina.ai", "wikipedia.org", "algolia.com", "reddit.com",
  "archive.org", "arxiv.org", "dns.google", "crt.sh", "rdap.org",
  "shodan.io", "urlscan.io", "api.github.com", "stackexchange.com",
  "nist.gov", "securityheaders.com"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const s = await caches.open(STATIC_CACHE);
    await s.addAll(APP_SHELL);
    const c = await caches.open(CDN_CACHE);
    await Promise.allSettled(CDN_ASSETS.map(u => fetch(u, { mode: "cors" }).then(r => r.ok && c.put(u, r))));
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== STATIC_CACHE && k !== CDN_CACHE) && caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!url.protocol.startsWith("http")) return;
  if (BYPASS_HOSTS.some(h => url.hostname === h || url.hostname.endsWith("." + h))) return;

  if (url.hostname.includes("cdnjs.cloudflare.com") || url.hostname.includes("js.puter.com")) {
    e.respondWith((async () => {
      const c = await caches.open(CDN_CACHE);
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r?.status === 200) c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || new Response("", { status: 504 });
    })());
    return;
  }

  if (req.mode === "navigate" || url.origin === self.location.origin) {
    e.respondWith((async () => {
      const s = await caches.open(STATIC_CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh?.status === 200) s.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return (await s.match(req)) || (await s.match("./index.html")) || new Response("Offline", { status: 503 });
      }
    })());
  }
});
