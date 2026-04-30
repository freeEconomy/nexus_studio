-- 포트폴리오 소유자(사람) 테이블
CREATE TABLE IF NOT EXISTS portfolios (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '포트폴리오'
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='portfolios' AND policyname='portfolios_all') THEN
    CREATE POLICY "portfolios_all" ON portfolios FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 기존 portfolio 테이블에 소유자 연결 컬럼 추가
ALTER TABLE portfolio ADD COLUMN IF NOT EXISTS portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL;

-- 기본 3개 포트폴리오 생성 (이름은 UI에서 변경 가능)
INSERT INTO portfolios (id, name) VALUES
  (1, '포트폴리오 1'),
  (2, '포트폴리오 2'),
  (3, '포트폴리오 3')
ON CONFLICT (id) DO NOTHING;
