-- 가상 시뮬레이션 대회 하루 점수를 유지 대비 초과 수익률로 정한다(decisions/2026-11-05-virtual-sim-contest 4-1 변경 기록, policies §8-8).
-- hold_balance: 같은 판을 사건마다 유지만 했을 때(첫 봉 시가 50% 최초 매수만)의 마지막 봉 총자산. 정산 때 같은 봉으로 계산해 둔다.
-- 이 칸이 생기기 전에 정산된 판은 NULL이고 하루 점수 계산에서 빠진다
ALTER TABLE virtual_contest_rounds ADD COLUMN hold_balance BIGINT NULL;
