# Nexus Studio 프로젝트 구조 및 연동 정리

## ✅ 전체 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    App.jsx (라우팅 레이어)              │
└───────────────────────────┬─────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      ┌──────────┐    ┌──────────┐    ┌──────────┐
      │  Navbar  │    │  Routes  │    │  Scroll  │
      └──────────┘    └─────┬────┘    └──────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │ Nexus Agent │   │    AI Lab   │   │   Journey   │
  │ (주간보고서) │   │ (멀티에이전트)│   │ (여행플래너) │
  └─────────────┘   └─────────────┘   └─────────────┘
                            │
                            ▼
                      ┌─────────────┐
                      │   Markets   │
                      │ (주식차트)  │
                      └─────────────┘
```

---

## 📌 메뉴 라우팅 연동 구조

### 1. Navbar 메뉴 정의 (`components/Navbar.jsx`)
| 메뉴 라벨   | 라우팅 경로          | 연결 페이지 컴포넌트       | 기능 설명                      |
|------------|---------------------|----------------------------|-------------------------------|
| Nexus Agent| `/weekly-report`    | AiAssistant / WeeklyReport | AI 기반 업무 자동화 + 주간보고서 |
| AI Lab     | `/multi-agent`      | MultiAgent                 | 멀티 에이전트 협업 프롬프트    |
| Journey    | `/travel-planner`   | TravelPlanner              | AI 여행 일정 생성 플래너       |
| Markets    | `/stock`            | Stock                      | 실시간 주식 차트 + 분석        |

### 2. 라우팅 구성 (`App.jsx`)
- 베이스 경로: `/nexus_studio` (vite 설정과 동기화 필요)
- 자동 스크롤 상단 이동 기능 적용
- 모든 페이지에 공통 Navbar 표시
- SPA 라우팅은 React Router v6 사용

---

## 📑 각 페이지 상세 기능

### 🔹 Nexus Agent (AiAssistant)
**주요 기능:**
- ✅ AI 채팅 인터페이스
- ✅ 업무 태스크 관리 (칸반보드 방식)
- ✅ 자동 주간 보고서 생성
- ✅ 마감일 계산 / D-Day 표시
- ✅ 태스크 상태별 카운터

**내부 구조:**
```
ChatTab ── 채팅 인터페이스
TasksTab ── 태스크 목록 / 필터
ReportTab ── 보고서 생성 / 복사
```

---

### 🔹 AI Lab (MultiAgent)
**주요 기능:**
- ✅ 복수 AI 에이전트 동시 호출 프레임워크
- ✅ Edge Function 직접 호출 인터페이스
- ✅ 다양한 모델 결과 동시 비교
- ✅ 응답 속도 측정 및 표시

**연동 백엔드:**
- Gemini
- Groq
- Tavily
- 기타 커스텀 LLM 모델

---

### 🔹 Journey (TravelPlanner)
**주요 기능:**
- ✅ 목적지 + 기간 입력으로 전체 여행 계획 자동 생성
- ✅ 날씨 예보 연동
- ✅ 지도 경로 시각화
- ✅ 추천 명소 / 맛집 목록
- ✅ 일일 스케쥴 타임라인
- ✅ 최근 검색 기록 저장

**탭 구성:**
```
📍 MapTab ── 지도 / 경로
📅 ItineraryTab ── 일일 일정
🏛️ PlacesTab ── 관광지 추천
🍽️ RestaurantsTab ── 맛집
🌤️ WeatherTab ── 날씨 예보
```

---

### 🔹 Markets (Stock)
**주요 기능:**
- ✅ 한국 / 미국 주식 실시간 시세
- ✅ 캔들 차트 시각화
- ✅ 검색 / 즐겨찾기
- ✅ 포트폴리오 관리
- ✅ AI 기반 종목 분석
- ✅ 뉴스 연동

**탭 구성:**
```
📊 DashboardTab ── 메인 대시보드
🇺🇸 USStocksTab ── 미국 주식
🇰🇷 KRStocksTab ── 한국 주식
💼 PortfolioTab ── 포트폴리오
🔍 SearchTab ── 종목 검색
```

---

## 🔌 백엔드 연동 구조

모든 페이지는 Supabase Edge Functions를 통해 외부 API와 통신합니다:

| 기능          | 엣지함수 명칭       | 외부 API               |
|---------------|--------------------|------------------------|
| 주식 시세      | stock-us-quote     | 한국투자증권 Open API  |
| 차트 데이터    | stock-kr-chart     |                        |
| LLM 호출       | query-gemini       | Google Gemini          |
| 검색 엔진      | query-tavily       | Tavily Search          |
| 여행 정보      | query-places       | Google Places          |
| 날씨 예보      | query-weather      | OpenWeatherMap         |

---

## 🎨 공통 컴포넌트

- `Navbar.jsx` - 전역 네비게이션
- `TravelMap.jsx` - 지도 컴포넌트
- `TravelFlowChart.jsx` - 타임라인 시각화
- 공통 스타일: `global.css`

---

## ⚙️ 개발 환경

- 프론트엔드: React + Vite
- 스타일: Pure CSS
- 라우팅: React Router v6
- 백엔드: Supabase Edge Functions (Deno)
- 배포: Vercel / Netlify 지원