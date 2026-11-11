-- 목표 시나리오 AI 조합 재사용에 프롬프트 버전을 더한다(Issue #406, policies §7-6).
-- 같은 조건이라도 만든 프롬프트 버전이 지금과 다르면 재사용하지 않고 새로 받아 덮어쓴다.
-- 기본 키는 그대로(조건마다 한 행). 기존 행은 버전을 몰라 null로 두고, null은 어느 버전과도 맞지 않는다.
ALTER TABLE goal_scenario_ai_cache ADD COLUMN prompt_version VARCHAR(40) NULL;
