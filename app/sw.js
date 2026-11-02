// Lưu sẵn app trên máy: có mạng thì lấy bản mới, mất mạng thì mở bản đã lưu
const CACHE = "so-cong-dau-v3";
const FILES = ["./", "index.html", "styles.css", "app.js", "lunar.js", "seed.js", "backend.js", "firebase-config.js", "people-list.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png",
  "fonts/be-vietnam-pro-400-vietnamese.woff2", "fonts/be-vietnam-pro-400-latin-ext.woff2", "fonts/be-vietnam-pro-400-latin.woff2", "fonts/be-vietnam-pro-500-vietnamese.woff2", "fonts/be-vietnam-pro-500-latin-ext.woff2", "fonts/be-vietnam-pro-500-latin.woff2", "fonts/be-vietnam-pro-600-vietnamese.woff2", "fonts/be-vietnam-pro-600-latin-ext.woff2", "fonts/be-vietnam-pro-600-latin.woff2", "fonts/be-vietnam-pro-700-vietnamese.woff2", "fonts/be-vietnam-pro-700-latin-ext.woff2", "fonts/be-vietnam-pro-700-latin.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // File chữ không đổi: lấy bản đã lưu trước, khỏi chờ mạng yếu rồi hiện chữ của máy
  if (new URL(e.request.url).pathname.includes("/fonts/")) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
