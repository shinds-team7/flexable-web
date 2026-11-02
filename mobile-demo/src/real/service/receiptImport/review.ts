// 검토 화면이 쓰는 순수 함수. expo 모듈을 쓰지 않아 단위 테스트에서 바로 돌린다.
export const normalizeTitle = (s: string) =>
  s.replace(/\s+/g, "").toLowerCase();

/** 이미 기록된 거래일 수 있는지 볼 때 쓰는 값. 같아도 확정은 아니라서 저장 키로는 쓰지 않는다. */
export const dupKey = (
  date: string,
  type: string,
  amount: number,
  title: string,
) => `${date}|${type}|${amount}|${normalizeTitle(title)}`;

/** 후보 날짜 전체를 덮는 조회 범위. GET /transactions는 최대 366일이라 넘으면 null. */
export function dateRange(dates: string[]) {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const days =
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5;
  return days < 366 ? { from, to } : null;
}
