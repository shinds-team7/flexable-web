-- user: 2026-10-21부터 가입에 필요한 정보는 동의가 아니라 계약 이행(개인정보 보호법 제15조제1항제4호)으로 처리하고 방침을 안내한다.
-- privacy_agreed_at은 그 전에 받은 '개인정보 수집·이용 동의(필수)' 시각으로 남기고, 이후 가입자는 NULL이다(과거 기록의 뜻을 바꾸지 않음).
ALTER TABLE users MODIFY COLUMN privacy_agreed_at DATETIME(6) NULL;
