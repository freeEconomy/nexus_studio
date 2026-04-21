-- KIS 액세스 토큰 캐시 테이블 (id=1 고정 row 방식)
CREATE TABLE IF NOT EXISTS kis_token_cache (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Edge Function (service_role)에서만 접근 가능
ALTER TABLE kis_token_cache ENABLE ROW LEVEL SECURITY;

-- service_role은 RLS 우회하므로 별도 policy 불필요
-- anon/authenticated 접근 차단 (기본 deny)
