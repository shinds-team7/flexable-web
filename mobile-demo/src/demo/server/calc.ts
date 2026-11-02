/**
 * 시연용 목 서버의 날짜·예산 계산. 실제 앱 서버(flexable-app backend/budget)의 규칙을 그대로 옮겼다.
 * 원 단위 정수, 나눗셈은 내림. 시연 전용이며 실제 서비스 계산은 서버가 한다(ADR-3).
 */
export const DAY = 86400000;
const KST = 9 * 3600000;

/** 'YYYY-MM-DD' (서울 기준) */
export const kstDate = (ms: number = Date.now()) => new Date(ms + KST).toISOString().slice(0, 10);
export const kstDateOf = (iso: string) => kstDate(Date.parse(iso));
/** 서울 시각 ISO 문자열 "2026-11-02T08:26:00.000+09:00" */
export const isoAt = (ms: number = Date.now()) => new Date(ms + KST).toISOString().replace('Z', '+09:00');
export const startOfDay = (date: string) => Date.parse(`${date}T00:00:00+09:00`);
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** 0=월 … 6=일 */
export const dayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

const pad = (n: number) => String(n).padStart(2, '0');
const ym = (date: string) => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) });
const shiftMonth = (y: number, m: number, n: number) => {
  const t = y * 12 + (m - 1) + n;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
};
const lengthOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function minusMonths(date: string, n: number) {
  const { y, m } = ym(date);
  const t = shiftMonth(y, m, -n);
  const d = Math.min(Number(date.slice(8, 10)), lengthOfMonth(t.y, t.m));
  return `${t.y}-${pad(t.m)}-${pad(d)}`;
}

// 실제 서버 PublicHolidays와 같은 목록(2026-11-01 이후)
const HOLIDAYS = new Set([
  '2026-12-25', '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01',
  '2027-05-01', '2027-05-03', '2027-05-05', '2027-05-13', '2027-06-06', '2027-07-17', '2027-07-19',
  '2027-08-15', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04',
  '2027-10-09', '2027-10-11', '2027-12-25', '2027-12-27',
]);

/** 그 달의 날짜(31 등 없는 날은 말일) */
function dayIn(y: number, m: number, day: number) {
  return `${y}-${pad(m)}-${pad(Math.min(day, lengthOfMonth(y, m)))}`;
}
/** 그 달의 실제 수입일 — 토·일·공휴일이면 다음 평일 */
function incomeDayIn(y: number, m: number, payday: number) {
  let d = dayIn(y, m, payday);
  while (dayIndex(d) >= 5 || HOLIDAYS.has(d)) d = addDays(d, 1);
  return d;
}
export function nextPayday(today: string, payday: number) {
  const { y, m } = ym(today);
  for (let i = -1; i <= 1; i++) {
    const t = shiftMonth(y, m, i);
    const d = incomeDayIn(t.y, t.m, payday);
    if (d > today) return d;
  }
  const t = shiftMonth(y, m, 2);
  return incomeDayIn(t.y, t.m, payday);
}
export function previousPayday(today: string, payday: number) {
  const { y, m } = ym(today);
  for (let i = 0; i >= -2; i--) {
    const t = shiftMonth(y, m, i);
    const d = incomeDayIn(t.y, t.m, payday);
    if (d <= today) return d;
  }
  const t = shiftMonth(y, m, -3);
  return incomeDayIn(t.y, t.m, payday);
}
/** [from, toExclusive) 사이에 고정지출 날짜가 몇 번 오는지 */
function occurrences(day: number, from: string, toExclusive: string) {
  let count = 0;
  const a = ym(from);
  const b = ym(toExclusive);
  for (let t = a; t.y * 12 + t.m <= b.y * 12 + b.m; t = shiftMonth(t.y, t.m, 1)) {
    const d = dayIn(t.y, t.m, day);
    if (d >= from && d < toExclusive) count++;
  }
  return count;
}
/** 기간 안 고정지출 날짜들 */
export function fixedDates(day: number, from: string, to: string) {
  const out: string[] = [];
  const a = ym(from);
  const b = ym(to);
  for (let t = a; t.y * 12 + t.m <= b.y * 12 + b.m; t = shiftMonth(t.y, t.m, 1)) {
    const d = dayIn(t.y, t.m, day);
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}

// ───────────── 요일 비중(§5) ─────────────
export const W_MIN = 5;
export const W_MAX = 30;
export const MIN_DAYS = 7;
export const MIN_WEEKDAYS = 3;
export const EVEN = [14, 14, 14, 14, 14, 14, 14];
export const WEEKEND = [12, 12, 12, 12, 14, 19, 19];
export const WEEKDAY = [16, 16, 16, 16, 16, 10, 10];

export function split(base: number, weights: number[], today: string, next: string) {
  let total = 0;
  for (let d = today; d < next; d = addDays(d, 1)) total += weights[dayIndex(d)];
  return weights.map((w) => Math.floor((base * w) / total));
}

/** 내 기록 기준 비중. spent: 날짜별 직접 기록한 지출 합(고정지출 자동 기록 제외) */
export function fromRecords(spent: Map<string, number>, today: string) {
  const to = addDays(today, -1);
  const limit = minusMonths(today, 3);
  let from: string | null = null;
  const sums = [0, 0, 0, 0, 0, 0, 0];
  let days = 0;
  for (const [d, v] of spent) {
    if (d < limit || d > to || v <= 0) continue;
    days++;
    sums[dayIndex(d)] += v;
    if (from === null || d < from) from = d;
  }
  const weekdays = sums.filter((s) => s > 0).length;
  if (days < MIN_DAYS || weekdays < MIN_WEEKDAYS || from === null)
    return { from, to, days, weekdays, weights: null as number[] | null };
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (let d = from; d <= to; d = addDays(d, 1)) counts[dayIndex(d)]++;
  return { from, to, days, weekdays, weights: share(sums, counts) };
}

function share(sums: number[], counts: number[]) {
  const avg = sums.map((s, k) => s / counts[k]);
  const order = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => avg[a] - avg[b]);
  for (let i = 0; i < 7; i++) {
    for (let j = 0; i + j < 7; j++) {
      const rest = 100 - W_MIN * i - W_MAX * j;
      let free = 0;
      for (let n = i; n < 7 - j; n++) free += avg[order[n]];
      if (rest <= 0 || free === 0) continue;
      const lambda = rest / free;
      const s = new Array<number>(7);
      let ok = true;
      for (let n = 0; n < 7 && ok; n++) {
        const k = order[n];
        const v = avg[k] * lambda;
        if (n < i) {
          ok = v <= W_MIN + 1e-9;
          s[k] = W_MIN;
        } else if (n >= 7 - j) {
          ok = v >= W_MAX - 1e-9;
          s[k] = W_MAX;
        } else {
          ok = v >= W_MIN - 1e-9 && v <= W_MAX + 1e-9;
          s[k] = v;
        }
      }
      if (ok) return round(s);
    }
  }
  return EVEN;
}
function round(s: number[]) {
  const w = s.map((v) => Math.floor(v + 1e-9));
  const frac = s.map((v, k) => v - w[k]);
  let total = w.reduce((a, b) => a + b, 0);
  const order = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => frac[b] - frac[a] || a - b);
  for (let n = 0; total < 100; n++, total++) w[order[n % 7]]++;
  return w;
}

// ───────────── 오늘 쓸 수 있는 돈(§1·§2·§5) ─────────────
export type CalcTx = { type: 'EXPENSE' | 'INCOME'; amount: number; occurredAt: string; fixed: boolean };
export type CalcInput = {
  balance: number;
  balanceAt: string;
  payday: number;
  cardUnpaid: number;
  fixed: { day: number; amount: number }[];
  protectedTotal: number;
  transactions: CalcTx[];
  savedSinceBalance: number;
  weights: number[];
};

export function compute(input: CalcInput, today: string) {
  const next = nextPayday(today, input.payday);
  const cycleStart = previousPayday(today, input.payday);
  const daysLeft = Math.max(1, daysBetween(today, next));
  const weekStart = addDays(today, -dayIndex(today));
  const weekEnd = addDays(weekStart, 6);
  const balanceAt = Date.parse(input.balanceAt);
  const endExclusive = startOfDay(addDays(today, 1));

  let estimated = input.balance - input.savedSinceBalance;
  let todaySpent = 0;
  let weekSpent = 0;
  for (const t of input.transactions) {
    const at = Date.parse(t.occurredAt);
    if (at >= endExclusive) continue;
    if (at > balanceAt) estimated += t.type === 'INCOME' ? t.amount : -t.amount;
    if (t.type === 'EXPENSE' && !t.fixed) {
      const d = kstDate(at);
      if (d === today) todaySpent += t.amount;
      if (d >= weekStart && d <= weekEnd) weekSpent += t.amount;
    }
  }
  let reservedFixed = 0;
  for (const f of input.fixed) reservedFixed += f.amount * occurrences(f.day, addDays(today, 1), next);

  const remaining = estimated - reservedFixed - input.cardUnpaid - input.protectedTotal;
  const dayBudgets = split(Math.max(0, remaining + todaySpent), input.weights, today, next);
  const dailyBudget = dayBudgets[dayIndex(today)];
  const todayAvailable = dailyBudget - todaySpent;
  const shortage = remaining < 0 ? -remaining : Math.max(0, todaySpent - dailyBudget);
  const weekLast = weekEnd < next ? weekEnd : addDays(next, -1);
  const weekDaysLeft = Math.max(1, daysBetween(today, weekLast) + 1);
  let weekBudget = 0;
  for (let d = today; d <= weekLast; d = addDays(d, 1)) weekBudget += dayBudgets[dayIndex(d)];
  const weekAvailable = Math.max(0, weekBudget - todaySpent);
  return {
    date: today,
    nextPayday: next,
    daysLeft,
    estimatedBalance: estimated,
    reservedFixed,
    cardUnpaid: input.cardUnpaid,
    protectedTotal: input.protectedTotal,
    remaining,
    todaySpent,
    dailyBudget,
    todayAvailable,
    shortage,
    weekSpent,
    weekDaysLeft,
    weekAvailable,
    cycleStart,
    dayBudgets,
  };
}

/** 누적 n번째 출석의 코인. 기본 5, 3일째와 8일째부터 7일 주기의 3·7번째 날은 55 */
export function attendanceReward(n: number) {
  const day = ((n - 1) % 7) + 1;
  const milestone = n === 3 || (n > 7 && (day === 3 || day === 7));
  return milestone ? 55 : 5;
}
