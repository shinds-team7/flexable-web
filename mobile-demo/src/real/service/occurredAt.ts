// 거래 날짜만 고르는 화면이 서버에 보낼 occurredAt을 정한다. expo 모듈을 쓰지 않아 단위 테스트에서 바로 돌린다.
const SEOUL_MS = 9 * 3600000;

/** ISO 일시의 한국 날짜 "YYYY-MM-DD". 읽을 수 없으면 null. */
export function seoulDateOf(iso: string) {
  // 서버는 마이크로초(".123456+09:00")를 보낸다. 밀리초까지만 남겨 어느 엔진에서나 읽히게 한다.
  const ms = new Date(iso.replace(/(\.\d{3})\d+/, "$1")).getTime();
  return Number.isNaN(ms)
    ? null
    : new Date(ms + SEOUL_MS).toISOString().slice(0, 10);
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00+09:00");
  return (
    !Number.isNaN(d.getTime()) &&
    new Date(d.getTime() + SEOUL_MS).toISOString().slice(0, 10) === value
  );
}

/**
 * 고른 날짜를 occurredAt으로 바꾼다.
 * - 수정에서 날짜를 바꾸지 않았으면 저장된 값을 그대로 둔다.
 * - 오늘이면 지금 시각을 쓴다. 서버가 기준 시각(balanceAt) 이후 거래만 추정 잔액에 넣으므로, 정오로 고정하면 방금 쓴 돈이 빠질 수 있다.
 * - 그 밖의 날짜는 한국 시간 정오로 둔다.
 */
export function occurredAtFor(
  date: string,
  existing: string | undefined,
  now: Date,
) {
  if (existing && seoulDateOf(existing) === date) return existing;
  const today = new Date(now.getTime() + SEOUL_MS).toISOString().slice(0, 10);
  return date === today ? now.toISOString() : `${date}T12:00:00+09:00`;
}
