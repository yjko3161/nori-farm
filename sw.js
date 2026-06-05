// 서비스 워커 - 오프라인 캐시
// 리다이렉트된 응답을 그대로 캐시하면 PWA 탐색에서 브라우저가 거부함 (흰화면 원인).
// → 받은 응답을 깨끗한 Response 로 재포장해서 저장.
const CACHE = "miro-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./maze.html",
  "./find.html",
  "./whack.html",
  "./memory.html",
  "./math.html",
  "./sound.html",
  "./snake.html",
  "./run.html",
  "./manifest.json",
  "./icons/icon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

async function cacheClean(cache, request, response) {
  // redirected=true 인 응답은 그대로 못 씀 → body 복사해서 새 Response 로
  const body = await response.clone().blob();
  const clean = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  await cache.put(request, clean);
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload", redirect: "follow" });
        if (res.ok || res.type === "opaque") await cacheClean(cache, url, res);
      } catch {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API 는 캐시하지 않음
  if (url.pathname.startsWith("/api/")) return;
  // POST, DELETE 등은 그대로 통과
  if (e.request.method !== "GET") return;

  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      if (url.origin === location.origin && (res.ok || res.type === "opaque")) {
        const cache = await caches.open(CACHE);
        await cacheClean(cache, e.request, res.clone());
      }
      return res;
    } catch {
      return cached || Response.error();
    }
  })());
});
