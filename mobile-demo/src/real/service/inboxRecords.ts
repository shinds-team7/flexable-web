// 알림함이 기기에 남기는 기록의 계산. expo 모듈을 쓰지 않아 test/inbox-records.test.cjs가 그대로 돌린다.
// 시각은 모두 밀리초(Date.getTime())다.

/** 기기에 예약하는 알림 종류: 수입일 전날 시드머니 알림, 24시간 기록 알림 */
export type ReminderKind = "seed" | "entry";
export type ReminderTime = { kind: ReminderKind; at: number };
/** sent: 예약 시각이 지나 보낸 것으로 보는 알림, pending: 아직 오지 않은 예약 */
export type Planned = { sent: ReminderTime[]; pending: ReminderTime[] };
/** 오늘 예산을 다 썼거나(over=false) 넘은(over=true) 상태를 앱이 처음 본 시각 */
export type BudgetNote = { date: string; over: boolean; at: number };
/** 직접 눌러 확인한 알림의 고유 키와 알림 시각 */
export type ReadReceipt = { key: string; at: number };

/** 기기 저장 칸이 작아(SecureStore 2KB) 종류마다 최근 것만 남긴다 */
export const KEEP = 20;

/**
 * 시각이 지난 예약을 보낸 알림으로 옮긴다. kind를 주면 그 종류의 남은 예약을 times로 바꾼다
 * (다시 예약하면 예전 예약은 오지 않으므로 버리고, 빈 배열이면 취소).
 */
export function plan(
  record: Planned,
  now: number,
  kind?: ReminderKind,
  times: number[] = [],
): Planned {
  const seen = new Set(record.sent.map((s) => `${s.kind}:${s.at}`));
  const due = record.pending.filter(
    (p) => p.at <= now && !seen.has(`${p.kind}:${p.at}`),
  );
  const sent = [...record.sent, ...due]
    .sort((a, b) => b.at - a.at)
    .slice(0, KEEP);
  let pending = record.pending.filter((p) => p.at > now);
  if (kind)
    pending = [
      ...pending.filter((p) => p.kind !== kind),
      ...times.filter((at) => at > now).map((at) => ({ kind, at })),
    ];
  return { sent, pending };
}

/**
 * 오늘 쓸 수 있는 돈(서버 값)이 0이면 '다 썼어요', 음수면 '넘었어요'를 그날 처음 본 시각으로 남긴다.
 * 같은 날 같은 상태는 한 번만 남긴다.
 */
export function noteBudget(
  notes: BudgetNote[],
  date: string,
  todayAvailable: number,
  now: number,
) {
  if (todayAvailable > 0) return notes;
  const over = todayAvailable < 0;
  if (notes.some((n) => n.date === date && n.over === over)) return notes;
  return [{ date, over, at: now }, ...notes].slice(0, KEEP);
}

/** 구버전의 읽음 기록은 유지하고, 이후에는 직접 확인한 항목만 읽음으로 본다. */
export function isUnread(item: ReadReceipt, seen: number, read: ReadReceipt[]) {
  return item.at > seen && !read.some((receipt) => receipt.key === item.key);
}

export function hasUnread(
  items: ReadReceipt[],
  seen: number,
  read: ReadReceipt[],
) {
  return items.some((item) => isUnread(item, seen, read));
}
