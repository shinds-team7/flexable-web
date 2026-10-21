// 신청 기한 계산. 날짜는 모두 KST 기준 "YYYY-MM-DD" 문자열로 받고, 비교는 날짜 수(일)로 한다(문자열·시각 비교 금지).
const DAY = 86_400_000;
const KST = 9 * 60 * 60 * 1000;

/** 지금 KST 날짜. 브라우저 시간대와 상관없이 같은 값이 나온다. */
export const todayKst = (now = new Date()) => new Date(now.getTime() + KST).toISOString().slice(0, 10);

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};

/** from → to 사이 날짜 수. 같은 날이면 0, to가 지났으면 음수 */
export const daysBetween = (from: string, to: string) => dayNum(to) - dayNum(from);
export const addDays = (iso: string, n: number) => new Date((dayNum(iso) + n) * DAY).toISOString().slice(0, 10);

export type ApplyPeriod = { applyStart?: string | null; applyDeadline?: string | null; alwaysOpen: boolean };

export type DeadlineState =
  | { kind: 'always' } // 상시 모집이 확인됨
  | { kind: 'unknown' } // 마감일을 확인할 수 없음(상시와 다름)
  | { kind: 'upcoming'; start: string } // 접수 전
  | { kind: 'today' }
  | { kind: 'open'; days: number }
  | { kind: 'closed' };

export function deadlineState(p: ApplyPeriod, today: string): DeadlineState {
  if (p.alwaysOpen) return { kind: 'always' };
  if (p.applyDeadline) {
    const days = daysBetween(today, p.applyDeadline);
    if (days < 0) return { kind: 'closed' };
    if (p.applyStart && daysBetween(today, p.applyStart) > 0) return { kind: 'upcoming', start: p.applyStart };
    return days === 0 ? { kind: 'today' } : { kind: 'open', days };
  }
  if (p.applyStart && daysBetween(today, p.applyStart) > 0) return { kind: 'upcoming', start: p.applyStart };
  return { kind: 'unknown' };
}

/** 지금 신청할 수 있다고 확인된 상태만 true. 마감일 미정은 확정하지 않는다. */
export const canApplyNow = (s: DeadlineState) => s.kind === 'always' || s.kind === 'today' || s.kind === 'open';
