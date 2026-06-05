// Cloudflare Worker — 가족 공용 랭킹 API
// 경로: /api/ranking/<game>
// 메서드: GET (TOP 10) / POST (점수 추가) / DELETE (전체 삭제)
//
// 배포:
//   1. Cloudflare 대시보드 → Workers & Pages → Create application → Worker
//   2. 이름 예: nori-farm-api → Deploy
//   3. 생성된 Worker 들어가서 "Edit code" 클릭 → 이 파일 전체 내용 붙여넣기 → Save and deploy
//   4. Settings → Variables → KV namespace bindings → Add:
//        Variable name: RANKINGS (대문자!)
//        KV namespace : nori-farm-rankings
//   5. Settings → Triggers → Routes → Add route:
//        Route: www.nori-farm.com/api/ranking/*
//        Zone : nori-farm.com
//   6. 선택: Settings → Variables → Environment variables → Add:
//        Variable name: ADMIN_TOKEN
//        Value: <임의의 긴 비밀 문자열>   (DELETE 보호용)

const KINDS = new Set([
  "maze", "find", "whack", "memory",
  "math", "sound", "snake", "run",
]);
const MAX_ENTRIES = 10;
const keyFor = (game) => `ranking:${game}`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

function clampInt(v, min, max, def = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function sanitize(body) {
  const rawName = String(body?.name ?? "익명").trim();
  const name = rawName.slice(0, 8) || "익명";
  const entry = {
    name,
    score: clampInt(body?.score, 0, 9_999_999),
    level: clampInt(body?.level, 0, 9999),
    seconds: clampInt(body?.seconds, 0, 99_999),
    date: String(body?.date ?? "").slice(0, 10),
    id: Number(body?.id) || Date.now(),
  };
  for (const opt of ["moves", "cleared", "wrong", "hits", "misses", "lives"]) {
    if (body && opt in body) {
      entry[opt] = clampInt(body[opt], 0, 999_999);
    }
  }
  return entry;
}

async function readRanking(env, game) {
  const raw = await env.RANKINGS.get(keyFor(game));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/ranking\/([a-z]+)\/?$/);
    if (!m) return json({ error: "not found" }, 404);
    const game = m[1];
    if (!KINDS.has(game)) return json({ error: "unknown kind" }, 404);
    if (!env.RANKINGS) {
      return json({ error: "KV binding RANKINGS missing" }, 500);
    }

    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (method === "GET") {
      return json(await readRanking(env, game));
    }

    if (method === "POST") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "bad json" }, 400); }
      const entry = sanitize(body);
      const list = await readRanking(env, game);
      list.push(entry);
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
      const top = list.slice(0, MAX_ENTRIES);
      await env.RANKINGS.put(keyFor(game), JSON.stringify(top));
      return json(top);
    }

    if (method === "DELETE") {
      if (env.ADMIN_TOKEN) {
        const token = request.headers.get("X-Admin-Token");
        if (token !== env.ADMIN_TOKEN) {
          return json({ error: "unauthorized" }, 401);
        }
      }
      await env.RANKINGS.put(keyFor(game), JSON.stringify([]));
      return json([]);
    }

    return json({ error: "method not allowed" }, 405);
  },
};
