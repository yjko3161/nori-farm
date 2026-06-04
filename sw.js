// 서비스 워커 - 오프라인에서도 게임 페이지 로딩
// 캐시 버전을 올리면 사용자가 다음에 들어왔을 때 자동 업데이트
const CACHE = "miro-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./maze.html",
  "./find.html",
  "./manifest.json",
  "./icons/icon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
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
  // API 호출은 캐시하지 않고 네트워크로 (랭킹은 항상 최신)
  if (url.pathname.startsWith("/api/")) return;
  // 그 외엔 캐시 우선, 없으면 네트워크
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        // 같은 도메인 GET만 캐시에 추가
        if (e.request.method === "GET" && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
