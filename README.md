# Nexus Studio

AI로 상상을 현실로 만드는 플랫폼

## 지원 모델 (모두 무료)

| 모델 | 제공 | 비고 |
|------|------|------|
| Gemini 2.5 Flash | Google | 무료 티어 |
| Llama 3.3 70B | Groq | 무료 티어 |
| DeepSeek R1 70B | Groq | 무료 티어 |
| Gemma 2 9B | Groq | 무료 티어 |

## 기술 스택

- **Frontend**: React + Vite → GitHub Pages
- **Backend**: Supabase Edge Functions
- **DB**: Supabase PostgreSQL

---

## 설치 및 배포

### 1. 레포 클론

```bash
git clone https://github.com/{username}/{repo-name}.git
cd {repo-name}
```

### 2. 프론트엔드 설정

```bash
cd frontend
npm install
cp .env.example .env
```

`.env` 파일 편집:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhxxxxxxxxxx
```

`vite.config.js`에서 base 경로 수정:
```js
base: '/{레포이름}/',
```

`App.jsx`에서 BASENAME 수정:
```js
const BASENAME = '/{레포이름}'
```

### 3. Supabase Edge Functions 배포

```bash
# Supabase CLI 설치
npm install -g supabase

# 로그인
supabase login

# 프로젝트 링크 (Supabase 프로젝트 ID 입력)
supabase link --project-ref {project-id}

# API 키 환경변수 설정
supabase secrets set GROQ_API_KEY=gsk_xxxx
supabase secrets set GEMINI_API_KEY=AIza_xxxx
# News API 키 설정 (News API 사용 시)
# supabase secrets set NEWS_API_KEY=your_newsapi_key

# 함수 배포
supabase functions deploy query-groq
supabase functions deploy query-gemini
supabase functions deploy query-news
```

### 4. GitHub Pages 배포

```bash
cd frontend
npm run deploy
```

GitHub 레포 → Settings → Pages → Source: `gh-pages` 브랜치 선택

---

## 개발 환경 실행

```bash
cd frontend
npm run dev
```

## 프로젝트 구조

```
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── MultiAgent.jsx
│   │   │   ├── WeeklyReport.jsx
│   │   │   └── Stock.jsx
│   │   ├── components/
│   │   │   └── Navbar.jsx
│   │   └── App.jsx
│   └── vite.config.js
└── supabase/
    └── functions/
        ├── query-groq/      ← Llama, DeepSeek, Gemma
        └── query-gemini/    ← Gemini 2.5 Flash
```
