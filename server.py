#!/usr/bin/env python3
"""동물 농장 놀이터 - 정적 파일 + 랭킹 API 서버.
- GET  /              → index.html (정적)
- GET  /maze.html     → 미로 게임
- GET  /find.html     → 틀린그림 게임
- GET  /api/ranking/maze  → 미로 랭킹 TOP 10
- GET  /api/ranking/find  → 틀린그림 랭킹 TOP 10
- POST /api/ranking/maze  → 점수 추가 후 TOP 10 반환
- POST /api/ranking/find  → 점수 추가 후 TOP 10 반환
랭킹은 data/ranking_*.json 에 저장 (서버 재시작해도 보존).
"""
import http.server
import json
import os
import socketserver
import threading
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

# 동시 쓰기 보호
_lock = threading.Lock()

# 지원하는 게임 종류
KINDS = ("maze", "find", "whack", "memory", "math", "sound", "snake", "run")


def _ranking_path(kind):
    return os.path.join(DATA, f"ranking_{kind}.json")


def load_ranking(kind):
    p = _ranking_path(kind)
    if not os.path.exists(p):
        return []
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_ranking(kind, data):
    p = _ranking_path(kind)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path.startswith("/api/ranking/"):
            kind = u.path.rsplit("/", 1)[-1]
            if kind in KINDS:
                self._json(200, load_ranking(kind))
            else:
                self._json(404, {"error": "unknown kind"})
            return
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/ranking/"):
            self._json(404, {"error": "not found"})
            return
        kind = u.path.rsplit("/", 1)[-1]
        if kind not in KINDS:
            self._json(404, {"error": "unknown kind"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            body = json.loads(raw)
        except Exception:
            self._json(400, {"error": "bad json"})
            return

        # 검증/정제 (악의적 입력 방지)
        try:
            name = str(body.get("name", "익명"))[:8] or "익명"
            score = max(0, min(int(body.get("score", 0)), 9_999_999))
            level = max(0, min(int(body.get("level", 0)), 9999))
            seconds = max(0, min(int(body.get("seconds", 0)), 99_999))
            entry = {
                "name": name,
                "score": score,
                "level": level,
                "seconds": seconds,
                "date": str(body.get("date", ""))[:10],
                "id": float(body.get("id", 0.0)),
            }
            # 게임별 추가 필드 (있으면 받고, 검증)
            for opt in ("moves", "cleared", "wrong", "hits", "misses", "lives"):
                if opt in body:
                    entry[opt] = max(0, min(int(body.get(opt, 0)), 999_999))
        except (TypeError, ValueError):
            self._json(400, {"error": "bad fields"})
            return

        with _lock:
            ranking = load_ranking(kind)
            ranking.append(entry)
            ranking.sort(key=lambda x: -x.get("score", 0))
            top = ranking[:10]
            save_ranking(kind, top)

        self._json(200, top)

    def do_DELETE(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/ranking/"):
            self._json(404, {"error": "not found"})
            return
        kind = u.path.rsplit("/", 1)[-1]
        if kind not in KINDS:
            self._json(404, {"error": "unknown kind"})
            return
        with _lock:
            save_ranking(kind, [])
        self._json(200, [])

    def do_OPTIONS(self):
        # CORS preflight (혹시 필요할 때)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingServer(("0.0.0.0", port), Handler)
    print(f"🐰 http://localhost:{port}/  (LAN: http://0.0.0.0:{port}/)")
    print(f"   데이터 디렉토리: {DATA}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
