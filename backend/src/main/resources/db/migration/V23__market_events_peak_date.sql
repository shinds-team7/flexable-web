-- 사건 핀 날짜: 기간 중 하루 등락 절댓값이 가장 큰 날(decisions/2026-11-03-event-pin-peak-day). 이전 행은 worker가 다시 탐지할 때 채운다
ALTER TABLE market_events ADD COLUMN peak_date DATE NULL;
