// 기록 알림 시각 계산. 기기 시간대 기준이고 expo 모듈을 쓰지 않아 단위 테스트에서 바로 돌린다.
const DAY = 24 * 60 * 60 * 1000;
/** 밤(22시~9시 전)이면 그다음 9시로 미룬다. */
export function awake(at: Date) {
  const d = new Date(at);
  if (d.getHours() >= 22) d.setDate(d.getDate() + 1);
  else if (d.getHours() >= 9) return d;
  d.setHours(9, 0, 0, 0);
  return d;
}
/** 마지막 기록부터 24시간마다, 아직 오지 않은 알림 시각을 count개까지 이른 순서로 준다. */
export function entryReminderTimes(last: Date, now: Date, count: number) {
  const times: Date[] = [];
  // 이보다 앞선 차례는 밤으로 미뤄져도 지금보다 이르다.
  let k = Math.max(1, Math.floor((now.getTime() - last.getTime()) / DAY));
  while (times.length < count) {
    const at = awake(new Date(last.getTime() + k * DAY));
    if (at.getTime() > now.getTime()) times.push(at);
    k++;
  }
  return times;
}
