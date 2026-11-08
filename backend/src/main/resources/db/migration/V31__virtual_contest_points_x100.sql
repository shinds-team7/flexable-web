-- 가상 시뮬레이션 대회 점수를 100점 단위로 바꾼다(Issue #308, policies §8-8: 하루 +100/0/−100, 주 ≥ +400 승급·≤ −400 강등).
-- 이미 저장된 하루 점수·주 합·판 점수·마지막 승급·강등 때 주 합을 ×100 한다. 판·잔액·순위 기준의 대소 관계는 그대로라 정산 결과가 바뀌지 않는다.
-- 이전 값은 하루 ±1의 합이라 절댓값이 100보다 작고, 바뀐 값은 0이거나 100의 배수다. −99~99만 바꿔서 다시 돌려도 결과가 같다(0은 ×100 해도 0)
UPDATE virtual_contest_days SET points = points * 100 WHERE points BETWEEN -99 AND 99;
UPDATE virtual_contest_weeks SET points = points * 100 WHERE points BETWEEN -99 AND 99;
UPDATE virtual_contest_entries SET board_points = board_points * 100 WHERE board_points BETWEEN -99 AND 99;
UPDATE virtual_contest_entries SET change_points = change_points * 100 WHERE change_points BETWEEN -99 AND 99;
