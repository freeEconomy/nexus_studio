-- tasks 테이블에 issue 컬럼 추가
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS issue TEXT;
