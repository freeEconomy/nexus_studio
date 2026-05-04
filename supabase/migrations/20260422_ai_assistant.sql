-- AI 비서 업무 관리 테이블
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service     TEXT NOT NULL CHECK (service IN ('MC', 'MS', 'COMMON')),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'received'
              CHECK (status IN ('received', 'analyzing', 'in_progress', 'hold', 'done')),
  priority    TEXT NOT NULL DEFAULT 'normal'
              CHECK (priority IN ('high', 'normal', 'low')),
  requester   TEXT,
  due_date    DATE,
  memo        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 채팅 기록 테이블
CREATE TABLE IF NOT EXISTS chat_history (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 주간보고 템플릿 테이블
CREATE TABLE IF NOT EXISTS report_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  template   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS 비활성화 (서비스롤 접근)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

-- anon 사용자도 읽기/쓰기 허용 (내부 앱 용도)
CREATE POLICY "allow_all_tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_chat" ON chat_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_templates" ON report_templates FOR ALL USING (true) WITH CHECK (true);
