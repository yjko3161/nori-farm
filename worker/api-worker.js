// Cloudflare Worker — 가족 공용 랭킹 API (D1 SQLite 백엔드)
// 경로: /api/ranking/<game>
// 메서드: GET (TOP 10) / POST (점수 추가) / DELETE (게임별 전체 삭제)
//
// 배포:
//   1. D1 데이터베이스 준비
//      대시보드 → Workers & Pages → D1 → Create database → 이름 'nori-farm-db'
//      (또는 `npx wrangler d1 create nori-farm-db`)
//   2. wrangler.toml 의 database_id 를 위에서 생성된 ID로 교체
//   3. 배포:
//      CLOUDFLARE_API_TOKEN=<토큰> npx wrangler deploy
//   4. 스키마는 첫 요청에 자동 생성됨 (CREATE TABLE IF NOT EXISTS)
//
// 데이터 확인:
//   대시보드 → D1 → nori-farm-db → Console 에서
//     SELECT * FROM rankings ORDER BY score DESC LIMIT 20;
//   같은 SQL 직접 실행 가능

const KINDS = new Set([
  "maze", "find", "whack", "memory",
  "math", "sound", "snake", "run",
]);
const MAX_ENTRIES = 10;
const OPT_FIELDS = ["moves", "cleared", "wrong", "hits", "misses", "lives"];
const SELECT_COLS =
  "id, name, score, level, seconds, moves, cleared, wrong, hits, misses, lives, date";

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

function sanitize(body, game) {
  const rawName = String(body?.name ?? "익명").trim();
  const name = rawName.slice(0, 8) || "익명";
  const entry = {
    id: Number(body?.id) || (Date.now() + Math.random()),
    game,
    name,
    score: clampInt(body?.score, 0, 9_999_999),
    level: clampInt(body?.level, 0, 9999),
    seconds: clampInt(body?.seconds, 0, 99_999),
    date: String(body?.date ?? "").slice(0, 10),
    created_at: Date.now(),
  };
  for (const opt of OPT_FIELDS) {
    entry[opt] = (body && opt in body) ? clampInt(body[opt], 0, 999_999) : 0;
  }
  return entry;
}

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS rankings (" +
    "pk INTEGER PRIMARY KEY," +
    "id REAL NOT NULL," +
    "game TEXT NOT NULL," +
    "name TEXT NOT NULL," +
    "score INTEGER NOT NULL DEFAULT 0," +
    "level INTEGER NOT NULL DEFAULT 0," +
    "seconds INTEGER NOT NULL DEFAULT 0," +
    "moves INTEGER NOT NULL DEFAULT 0," +
    "cleared INTEGER NOT NULL DEFAULT 0," +
    "wrong INTEGER NOT NULL DEFAULT 0," +
    "hits INTEGER NOT NULL DEFAULT 0," +
    "misses INTEGER NOT NULL DEFAULT 0," +
    "lives INTEGER NOT NULL DEFAULT 0," +
    "date TEXT NOT NULL DEFAULT ''," +
    "created_at INTEGER NOT NULL DEFAULT 0)"
  );
  await db.exec(
    "CREATE INDEX IF NOT EXISTS idx_game_score ON rankings(game, score DESC, created_at ASC)"
  );
  schemaReady = true;
}

async function readTop(db, game) {
  const stmt = db.prepare(
    `SELECT ${SELECT_COLS} FROM rankings WHERE game = ? ORDER BY score DESC, created_at ASC LIMIT ?`
  );
  const { results } = await stmt.bind(game, MAX_ENTRIES).all();
  return results || [];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /api/ 외 모든 요청은 정적 자산으로 forward (HTML/CSS/JS/이미지 등)
    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not found", { status: 404 });
    }

    const m = url.pathname.match(/^\/api\/ranking\/([a-z]+)\/?$/);
    if (!m) return json({ error: "not found" }, 404);
    const game = m[1];
    if (!KINDS.has(game)) return json({ error: "unknown kind" }, 404);
    if (!env.DB) return json({ error: "D1 binding DB missing" }, 500);

    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    await ensureSchema(env.DB);

    if (method === "GET") {
      return json(await readTop(env.DB, game));
    }

    if (method === "POST") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "bad json" }, 400); }
      const entry = sanitize(body, game);
      await env.DB.prepare(
        "INSERT INTO rankings " +
        "(id, game, name, score, level, seconds, moves, cleared, wrong, hits, misses, lives, date, created_at) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        entry.id, entry.game, entry.name, entry.score, entry.level, entry.seconds,
        entry.moves, entry.cleared, entry.wrong, entry.hits, entry.misses, entry.lives,
        entry.date, entry.created_at
      ).run();
      return json(await readTop(env.DB, game));
    }

    if (method === "DELETE") {
      if (env.ADMIN_TOKEN) {
        const token = request.headers.get("X-Admin-Token");
        if (token !== env.ADMIN_TOKEN) {
          return json({ error: "unauthorized" }, 401);
        }
      }
      await env.DB.prepare("DELETE FROM rankings WHERE game = ?")
        .bind(game).run();
      return json([]);
    }

    return json({ error: "method not allowed" }, 405);
  },
};
