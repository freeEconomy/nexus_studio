INSERT INTO report_templates (name, template) VALUES (
  'weekly_report',
  '# {{서비스}} {{주차}}주차 주간보고

---

# 기획
{{기획 관련 업무 목록 - 없으면 "해당 없음"}}

# 디자인/퍼블
{{디자인 및 퍼블리싱 관련 업무 목록 - 없으면 "해당 없음"}}

# 개발
{{개발 관련 업무 목록 - 없으면 "해당 없음"}}

# 기타
{{위 항목에 해당하지 않는 업무 목록 - 없으면 "해당 없음"}}'
) ON CONFLICT DO NOTHING;
