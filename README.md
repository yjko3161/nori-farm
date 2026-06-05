# 🐰 nori-farm — 동물 농장 놀이터

초등학교 1학년을 위한 웹게임 모음. 토끼와 당근 테마의 PWA(Progressive Web App)로, 아이폰/안드로이드 홈 화면에 추가하면 진짜 앱처럼 동작합니다.

🌐 **라이브**: [https://nori-farm.com](https://nori-farm.com)

---

## 🎮 게임 목록 (8개)

| | 게임 | 설명 |
|---|---|---|
| 🌀 | **미로 찾기** | 절차적으로 생성되는 무한 미로. 토끼(🐰)가 당근(🥕)을 찾아가요. 레벨 올라가면 미로 확장 + 수집 미션 + 시야 제한 |
| 🔍 | **틀린 그림 찾기** | 동물 농장 장면 7종 (헛간/텃밭/연못/우주/바닷속/부엌/놀이공원). 차이 5~7개, 레벨별 제한시간 |
| 🎯 | **두더지 잡기** | 20초 라운드. 동시 다수 두더지, 폭탄💣/황금⭐, 콤보 시스템, 후반 4×4 |
| 🃏 | **메모리 카드** | 같은 그림 짝 맞추기. 3쌍 → 10쌍 점차 증가 |
| 🔢 | **수학 퀴즈** | 1학년 수준의 덧셈/뺄셈 (레벨 올라가면 곱셈). 목숨 3개 |
| 🎵 | **소리 따라하기** | 사이먼 게임. 색과 소리 시퀀스를 외워서 따라하기 |
| 🐍 | **스네이크** | 당근 먹고 길어지기. 키보드/D-pad/스와이프 모두 지원 |
| 🏃 | **토끼 달리기** | 1분 안에 결승선까지! 화면 연타 클리커. 60m~1000m 거리 선택 |

---

## ✨ 공통 기능

- 🛑 **그만하기** 누르면 점수 → 이름 입력 → **랭킹 TOP 10** 저장
- 🌐 **가족 공용 랭킹** (집 서버 켜져있을 때) / 📱 **기기별 로컬 랭킹** (외부)
- 🔊 **효과음** — 게임마다 다른 톤 (Web Audio API로 직접 생성, 외부 파일 없음)
- 🔇 **음소거 토글** (게임별 독립 저장)
- 📱 **PWA** — 홈 화면 추가 시 전체화면 앱으로 동작, 오프라인 캐시 지원
- 🎨 모든 화면이 같은 톤 (따뜻한 노랑/오렌지) — 1학년 친화적 디자인

---

## 🛠 기술 스택

- **순수 HTML + CSS + JavaScript** — 빌드 없음, 의존성 없음
- **SVG** 일러스트 (틀린 그림 찾기 장면들)
- **Web Audio API** — 효과음 실시간 합성
- **Canvas API** — 스네이크 렌더링
- **Service Worker** — 오프라인 캐시, PWA 지원
- **Python 표준 라이브러리** — 랭킹 서버 (`server.py`, 외부 패키지 0개)
- **Cloudflare Workers** — 배포 + HTTPS + 커스텀 도메인

---

## 🚀 로컬에서 실행하기

```bash
git clone https://github.com/yjko3161/nori-farm.git
cd nori-farm
python3 server.py 8000
```

→ 브라우저에서 [http://localhost:8000](http://localhost:8000) 접속

LAN 안의 다른 기기(폰/태블릿)에서 접속하려면 PC의 IP를 사용:

```
http://<PC_IP>:8000
```

---

## 📡 랭킹 API

가족 공용 랭킹은 두 가지 환경에서 동작합니다.

### 프로덕션 (`nori-farm.com` — Cloudflare Pages Functions + KV)

`functions/api/ranking/[game].js` 가 자동으로 요청을 처리합니다.
저장은 **Cloudflare KV** namespace `RANKINGS`.

### 로컬 개발 (`python3 server.py`)

`server.py` 가 같은 API를 제공합니다. 저장은 `data/ranking_<game>.json` 파일.

### 공통 인터페이스

```
GET    /api/ranking/<game>    → TOP 10 조회
POST   /api/ranking/<game>    → 점수 추가, 갱신된 TOP 10 반환
DELETE /api/ranking/<game>    → 전체 삭제 (ADMIN_TOKEN 설정 시 보호)
```

`<game>`: `maze` | `find` | `whack` | `memory` | `math` | `sound` | `snake` | `run`

랭킹 초기화 예시 (프로덕션, 토큰 보호 시):
```bash
curl -X DELETE -H "X-Admin-Token: <비밀토큰>" https://nori-farm.com/api/ranking/maze
```

---

## ☁️ Cloudflare Pages KV 설정 (최초 1회)

프로덕션에서 가족 공용 랭킹이 동작하려면 KV namespace 바인딩이 필요합니다.

1. **KV namespace 생성**
   - Cloudflare 대시보드 → **Workers & Pages** → **KV** → **Create namespace**
   - 이름 예: `nori-farm-rankings`

2. **Pages 프로젝트에 바인딩**
   - 대시보드 → **Workers & Pages** → 프로젝트 선택 → **Settings** → **Functions** → **KV namespace bindings** → **Add binding**
   - **Variable name**: `RANKINGS` (이 이름 그대로!)
   - **KV namespace**: 위에서 만든 namespace 선택

3. **(선택) DELETE 토큰 설정**
   - **Settings** → **Environment variables** → **Add variable**
   - Name: `ADMIN_TOKEN`, Value: 임의의 긴 문자열 (Production / Preview 둘 다 권장)

4. **재배포**
   - 설정 후 다음 `git push` 시 자동 반영, 또는 대시보드에서 **Retry deployment**

확인: 배포 후 `https://nori-farm.com/api/ranking/maze` 가 `[]` (또는 기록 배열) 을 반환하면 성공.

---

## 📂 프로젝트 구조

```
nori-farm/
├── index.html          # 메인 (게임 선택)
├── maze.html           # 🌀 미로 찾기
├── find.html           # 🔍 틀린 그림 찾기
├── whack.html          # 🎯 두더지 잡기
├── memory.html         # 🃏 메모리 카드
├── math.html           # 🔢 수학 퀴즈
├── sound.html          # 🎵 소리 따라하기
├── snake.html          # 🐍 스네이크
├── run.html            # 🏃 토끼 달리기 (클리커)
├── manifest.json       # PWA 매니페스트
├── sw.js               # 서비스 워커 (오프라인 캐시)
├── server.py           # 랭킹 API + 정적 파일 서버
├── icons/              # PWA 아이콘 (32, 180, 192, 512, 1024)
├── functions/          # Cloudflare Pages Functions (프로덕션 API)
│   └── api/ranking/[game].js
└── data/               # 런타임 랭킹 데이터 (gitignore, 로컬 server.py용)
```

각 게임 파일은 **자기 자신 안에 모든 것이 들어있는 단일 HTML 파일**입니다 (HTML/CSS/JS 분리 없음). 그래서 한 파일만 수정/배포하면 됩니다.

---

## 📱 아이폰에 앱처럼 설치

1. 사파리로 [https://nori-farm.com](https://nori-farm.com) 접속
2. 하단 **공유** 버튼 (↑) → **홈 화면에 추가**
3. 홈에 🐰 아이콘 생성됨
4. 누르면 전체화면으로 실행 (주소창 없음)

---

## 🤖 만든 사람

부모가 자녀(초등학교 1학년)와 함께 즐기려고 만든 작은 프로젝트.  
Claude Code(Anthropic)와 페어 프로그래밍으로 작성됨.

광고 없음. 결제 없음. 외부 추적 없음. 그냥 가족용.
