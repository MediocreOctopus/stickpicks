// stickpicks service worker: makes the site load fast, work offline, and install as an app.
//
// Pages (HTML) are always fetched from the network first, so a new deploy shows up right away;
// the saved copy is only used when the network is unavailable. Shared files are versioned with
// ?v=YYYY-MM-DD, so they can be served straight from the cache. Live data (Supabase) is never cached.
//
// When bumping the ?v= date in the pages, bump VERSION here too, so the old cache is cleared.
const VERSION = "2026-10-18";
const CACHE = `stickpicks-${VERSION}`;
const V = `?v=${VERSION}`;

const SHELL = [
  "./", "index.html", "teams.html", "profile.html", "sheet.html", "leaderboard.html", "rules.html", "intermission.html", "compare.html",
  `styles.css${V}`, `teams.js${V}`, `config.js${V}`, `game.js${V}`, `logo.svg${V}`,
  "manifest.webmanifest", "icon-32.png", "icon-180.png", "icon-192.png", "icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("stickpicks-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);

  // Live data and sign-in: always straight to the network, never cached.
  if(url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return;

  // Pages: network first; fall back to the saved copy of that page (ignoring ?team=…), then the home page.
  if(req.mode === "navigate"){
    event.respondWith((async () => {
      try{
        const fresh = await fetch(req);
        if(fresh.ok){ const c = await caches.open(CACHE); c.put(url.pathname.endsWith("/") ? "./" : url.pathname.split("/").pop(), fresh.clone()); }
        return fresh;
      }catch(e){
        const c = await caches.open(CACHE);
        return (await c.match(req, {ignoreSearch:true})) || (await c.match("index.html")) || Response.error();
      }
    })());
    return;
  }

  // Versioned site files, icons, fonts and the Supabase library: cache first, then the network.
  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "cdn.jsdelivr.net";
  if(!cacheable) return;
  event.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    // Google Fonts' stylesheet is small and can change: refresh it in the background.
    if(hit && url.hostname !== "fonts.googleapis.com") return hit;
    const net = fetch(req).then(res => { if(res.ok || res.type === "opaque") c.put(req, res.clone()); return res; });
    return hit ? (event.waitUntil(net.catch(() => {})), hit) : net;
  })());
});
