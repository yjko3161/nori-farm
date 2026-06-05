// Cloudflare Pages Function — 가족 공용 랭킹 API
// 경로: /api/ranking/<game>
// 메서드: GET (TOP 10), POST (점수 추가), DELETE (전체 삭제 — ADMIN_TOKEN 설정 시 보호)
//
// 필요한 바인딩:
//   - KV namespace, 변수명 RANKINGS
// 선택 환경변수:
//   - ADMIN_TOKEN : 설정 시 DELETE에 X-Admin-Token 헤더 일치 요구
//
// KV 키 구조: ranking:<game> → JSON 배열 (TOP 10)

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
  const name = (rawName.slice(0, 8) || "익명");
  const entry = {
    name,
    score: clampInt(body?.score, 0, 9_999_999),
    level: clampInt(body?.level, 0, 9999),
    seconds: clampInt(body?.seconds, 0, 99_999),
    date: String(body?.date ?? "").slice(0, 10),
    id: Number(body?.id) || Date.now(),
  };
  // 게임별 추가 필드 — 있을 때만 받음
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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env, params }) {
  const game = params.game;
  if (!KINDS.has(game)) return json({ error: "unknown kind" }, 404);
  if (!env.RANKINGS) return json({ error: "KV binding RANKINGS missing" }, 500);
  return json(await readRanking(env, game));
}

export async function onRequestPost({ env, params, request }) {
  const game = params.game;
  if (!KINDS.has(game)) return json({ error: "unknown kind" }, 404);
  if (!env.RANKINGS) return json({ error: "KV binding RANKINGS missing" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const entry = sanitize(body);
  const list = await readRanking(env, game);
  list.push(entry);
  list.sort((a, b) => (b.score || 0) - (a.score || 0));
  const top = list.slice(0, MAX_ENTRIES);
  await env.RANKINGS.put(keyFor(game), JSON.stringify(top));
  return json(top);
}

export async function onRequestDelete({ env, params, request }) {
  const game = params.game;
  if (!KINDS.has(game)) return json({ error: "unknown kind" }, 404);
  if (!env.RANKINGS) return json({ error: "KV binding RANKINGS missing" }, 500);

  // ADMIN_TOKEN 설정되어 있으면 헤더 검증
  if (env.ADMIN_TOKEN) {
    const token = request.headers.get("X-Admin-Token");
    if (token !== env.ADMIN_TOKEN) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  await env.RANKINGS.put(keyFor(game), JSON.stringify([]));
  return json([]);
}
