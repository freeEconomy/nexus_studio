# Nexus Studio — 기술 구조 정리

## 프로젝트 기본 정보

| 항목 | 내용 |
|------|------|
| **사이트명** | Nexus Studio |
| **프론트엔드** | React (Vite) |
| **백엔드** | Supabase Edge Functions (Deno 런타임) |
| **데이터베이스** | Supabase (PostgreSQL) |

---

## Supabase Edge Functions의 역할

React 프론트엔드는 외부 API를 직접 호출하지 않고,  
**모든 외부 통신을 Supabase Edge Functions를 통해 처리**합니다.

| 역할 | 설명 |
|------|------|
| **API 키 보호** | 외부 API 키를 서버 환경변수에만 저장. 브라우저에 노출 없음 |
| **캐싱 레이어** | 반복 API 호출을 Supabase DB 테이블에 캐시하여 비용 절감 |
| **비즈니스 로직** | 여러 API 결과를 조합·가공해 프론트에 단일 응답 반환 |

---

## 메뉴별 외부 API 연동

---

### 1. Nexus Agent (AI 어시스턴트)

**담당 Function:** `assistant-agent` · `query-groq` · `query-tavily` · `query-news` · `query-gemini`

| API | 용도 | 비고 |
|-----|------|------|
| **Groq API** | LLM 추론 (메인) | Llama 4 / Llama 3.3 / 3.1 모델 체인, 429 오류 시 자동 fallback |
| **Google Gemini** | LLM 추론 (별도 모델) | gemini-2.5-flash-lite |
| **Tavily Search** | 웹 실시간 검색 | LLM 응답에 최신 웹 정보 주입 |
| **NewsAPI** | 뉴스 검색 | newsapi.org, 쿼리당 최대 5건 |

- `assistant-agent`: 도구 호출(tool calling) 방식으로 태스크 CRUD 처리
- `query-groq`: SSE 스트리밍 응답 지원, 최대 6가지 모델 자동 fallback 체인

---

### 2. AI Hub (멀티 에이전트)

**담당 Function:** `query-groq` (모델 설정만 다르게 병렬 호출)

| API | 용도 |
|-----|------|
| **Groq API** | 동일 프롬프트를 여러 모델에 동시 요청하여 응답 품질 비교 |
| **Tavily Search** | 웹 검색 컨텍스트 주입 (선택적) |

- 사용 모델: `llama-4-scout` · `llama-4-maverick` · `llama-3.3-70b` · `compound-beta` 등 6종
- 동일 질문에 대한 모델별 응답 차이를 한 화면에서 비교

---

### 3. Journey (여행 플래너)

**담당 Function:** `query-groq` · `query-places` · `fetch-image` · `query-weather` · `query-route` · `query-accommodation` · `query-duffel`

| API | 용도 | 비고 |
|-----|------|------|
| **Groq API** | 여행 일정 자동 생성, 장소 추천 JSON 생성 | temperature 0.2 (결정론적 출력) |
| **OpenWeatherMap** | 날씨 예보 | 3시간 단위 40포인트 예보 |
| **Unsplash** | 장소 이미지 검색 (1순위) | 30일 캐시 적용 |
| **Pexels** | 장소 이미지 검색 (2순위) | Unsplash 실패 시 fallback |
| **Picsum Photos** | 이미지 fallback (무인증) | Pexels도 실패 시 최종 fallback |
| **OpenRouteService** | 경로 탐색 (거리/소요시간) | driving-car 프로필 |
| **RapidAPI → Booking.com** | 숙박 검색 | TripAdvisor도 병렬 시도 |
| **Duffel** | 항공권 검색 | 편도/왕복, 최대 5개 오퍼 반환 |
| **Kakao Maps SDK** | 국내 지도 표시 | 한국 좌표 감지 시 자동 전환 |
| **Stadia Maps (Leaflet)** | 해외 지도 표시 | alidade_smooth_dark 타일 |

> **국내/해외 지도 자동 감지:** `isKorea(lat, lng)` — 위도 33~38.9 / 경도 124.5~131.0 범위

---

### 4. Markets (주식 대시보드)

**담당 Function:** `stock-us-*` (5개) · `stock-kr-*` (5개) · `stock-ai-analyze`

#### 미국 주식

| API | 용도 |
|-----|------|
| **Finnhub** | 실시간 주가, 기업 뉴스, 감성 분석 |
| **Yahoo Finance** | 지수(S&P 500, NASDAQ) 및 차트 OHLCV 데이터 |

#### 국내 주식

| API | 용도 |
|-----|------|
| **한국투자증권 (KIS) OpenAPI** | 실시간 주가 (KOSPI/KOSDAQ), OAuth2 인증 토큰 |
| **Naver Finance** | 지수(KOSPI, KOSDAQ) 실시간 폴링 |
| **Yahoo Finance** | 차트 데이터 (KIS 실패 시 fallback) |

#### AI 종목 분석

| API | 용도 |
|-----|------|
| **Groq API — qwen3-32b** | 종목 수치 분석 (추론 모드) |
| **Groq API — llama-3.1-8b** | 뉴스 한국어 요약 |
| **Tavily Search** | 종목 최신 뉴스 검색 (30일 이내) |

#### 캐싱 전략

| 대상 | 캐시 위치 | TTL |
|------|-----------|-----|
| 주가 (한국/미국) | `stock_quote_cache` 테이블 | 5분 |
| 차트 데이터 | `stock_quote_cache` 테이블 | 1시간 |
| 장소 이미지 | `image_cache` 테이블 | 30일 |
| KIS 인증 토큰 | `kis_token_cache` 테이블 | 23시간 |

---

## 전체 외부 API 요약 (13종)

| 카테고리 | API | 사용 메뉴 |
|----------|-----|-----------|
| LLM | Groq (Llama 4 / Llama 3) | Agent · AI Hub · Journey · Markets |
| LLM | Google Gemini | AI Hub |
| 웹검색 | Tavily | Agent · AI Hub · Markets |
| 뉴스 | NewsAPI | Agent |
| 날씨 | OpenWeatherMap | Journey |
| 이미지 | Unsplash / Pexels | Journey |
| 지도 | Kakao Maps / Stadia Maps | Journey |
| 경로 | OpenRouteService | Journey |
| 숙박 | RapidAPI (Booking.com / TripAdvisor) | Journey |
| 항공 | Duffel | Journey |
| 미국주식 | Finnhub / Yahoo Finance | Markets |
| 국내주식 | 한국투자증권(KIS) / Naver Finance | Markets |
| AI 분석 | Groq (qwen3-32b) + Tavily | Markets |

---

## Supabase Edge Functions 전체 목록 (22개)

| Function | 역할 |
|----------|------|
| `assistant-agent` | 태스크 관리 AI (tool calling) |
| `query-groq` | 범용 LLM 추론 + 스트리밍 |
| `query-gemini` | Google Gemini 추론 |
| `query-tavily` | 웹 검색 + 요약 |
| `query-news` | NewsAPI 뉴스 검색 |
| `query-places` | AI 장소 추천 (JSON) |
| `fetch-image` | 이미지 검색 + 캐싱 |
| `query-weather` | 날씨 예보 |
| `query-route` | 경로 탐색 |
| `query-accommodation` | 숙박 검색 |
| `query-duffel` | 항공권 검색 |
| `stock-us-quote` | 미국 주가 실시간 |
| `stock-us-index` | 미국 지수 실시간 |
| `stock-us-chart` | 미국 주식 차트 |
| `stock-us-search` | 미국 종목 검색 |
| `stock-us-news` | 미국 기업 뉴스 |
| `stock-kr-quote` | 국내 주가 실시간 |
| `stock-kr-index` | 국내 지수 실시간 |
| `stock-kr-chart` | 국내 주식 차트 |
| `stock-kr-search` | 국내 종목 검색 |
| `stock-kr-token` | KIS OAuth2 토큰 |
| `stock-ai-analyze` | 종목 AI 분석 |

---

## 환경변수 목록

### 백엔드 (Supabase Edge Functions)

| 변수명 | 용도 |
|--------|------|
| `GROQ_API_KEY` | Groq LLM API |
| `GEMINI_API_KEY` | Google Gemini API |
| `TAVILY_API_KEY` | Tavily 웹 검색 |
| `NEWS_API_KEY` | NewsAPI 뉴스 |
| `OPENWEATHER_API_KEY` | 날씨 예보 |
| `OPENROUTESERVICE_API_KEY` | 경로 탐색 |
| `UNSPLASH_KEY` | 이미지 검색 |
| `PEXELS_KEY` | 이미지 검색 (fallback) |
| `RAPIDAPI_KEY` | Booking.com / TripAdvisor |
| `DUFFEL_API_KEY` | 항공권 검색 |
| `FINNHUB_API_KEY` | 미국 주식 |
| `KIS_APP_KEY` | 한국투자증권 |
| `KIS_APP_SECRET` | 한국투자증권 |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 DB 접근 |

### 프론트엔드 (React — VITE_ 접두사)

| 변수명 | 용도 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 익명 키 |
| `VITE_KAKAO_MAP_KEY` | 카카오맵 SDK |
| `VITE_STADIA_KEY` | Stadia Maps 타일 |
