// Offline support: the app is fetched fresh when online and falls back to the saved copy offline.
// Bump VERSION whenever the app's files change.
const VERSION = "practice-v2";
const SHELL = ["./", "index.html", "css/app.css", "js/config.js", "js/app.js", "js/music.js", "js/theory.js", "data/song-lessons.json", "vendor/supabase.js", "vendor/591.supabase.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png", "data/starter-songs.json"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("practice-v") && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// block-end alerts
self.addEventListener("push", e => {
  let d = {}; try{ d = e.data ? e.data.json() : {}; }catch(_){ d = { title:"Practice Log", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Practice Log", { body: d.body || "", tag: d.tag || "block", renotify: true,
    icon: "icons/icon-192.png", badge: "icons/icon-192.png" }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type:"window", includeUncontrolled:true }).then(list => {
    for(const c of list){ if("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  // fonts: keep the first copy
  if(url.hostname.endsWith("gstatic.com") || url.hostname === "fonts.googleapis.com"){
    e.respondWith(caches.open("practice-fonts").then(async c => {
      const hit = await c.match(req); if(hit) return hit;
      const res = await fetch(req); if(res.ok || res.type === "opaque") c.put(req, res.clone()); return res;
    }));
    return;
  }
  // the app itself: network first, saved copy when offline
  if(url.origin === location.origin){
    e.respondWith(fetch(req).then(res => {
      if(res.ok){ const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch:true })) || (req.mode === "navigate" ? caches.match("index.html") : Response.error())));
  }
});
