/**
 * 날짜 유틸. 주(week)는 월요일 시작 ~ 일요일 종료 기준.
 * 내부적으로 시간은 버리고 "자정" Date 만 다룬다.
 */
export const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY);
}

export function isSameDay(a: Date, b: Date): boolean {
  return diffDays(a, b) === 0;
}

/** 해당 날짜가 속한 주의 월요일 */
export function startOfWeek(d: Date): Date {
  const dow = (d.getDay() + 6) % 7; // 월=0 ... 일=6
  return addDays(startOfDay(d), -dow);
}

export function endOfWeek(d: Date): Date {
  return addDays(startOfWeek(d), 6);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** "10월 3주차" — 주의 목요일이 속한 달 기준(ISO 방식)으로 계산 */
export function weekLabel(weekStart: Date): string {
  const thu = addDays(weekStart, 3);
  const firstThu = (() => {
    const first = startOfMonth(thu);
    const offset = (4 - first.getDay() + 7) % 7;
    return addDays(first, offset);
  })();
  const n = Math.floor(diffDays(thu, firstThu) / 7) + 1;
  return `${thu.getMonth() + 1}월 ${n}주차`;
}

export function md(d: Date): string {
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export function toKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ───────────── 정산 주기 (수입일 ~ 다음 수입일 전날) ─────────────

/** 오늘이 속한 정산 주기의 시작일(최근 수입일) */
export function cycleStart(today: Date, payday: number): Date {
  const clamp = (y: number, m: number) => new Date(y, m, Math.min(payday, new Date(y, m + 1, 0).getDate()));
  const thisMonth = clamp(today.getFullYear(), today.getMonth());
  return today >= thisMonth ? thisMonth : clamp(today.getFullYear(), today.getMonth() - 1);
}

/** 다음 수입일 */
export function nextPayday(today: Date, payday: number): Date {
  const s = cycleStart(today, payday);
  return new Date(s.getFullYear(), s.getMonth() + 1, Math.min(payday, new Date(s.getFullYear(), s.getMonth() + 2, 0).getDate()));
}

/** 정산 주기의 마지막 날(다음 수입일 전날) */
export function cycleEnd(today: Date, payday: number): Date {
  return addDays(nextPayday(today, payday), -1);
}
