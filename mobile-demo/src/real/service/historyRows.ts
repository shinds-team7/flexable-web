/**
 * 내역 화면 목록·달력에 실제 거래와 예정 지출을 함께 놓는 규칙.
 * 예정 지출은 실제 거래가 아니므로 지출·수입 합계에는 넣지 않고 날짜별 `planned`로만 따로 센다(docs/policies.md §6).
 */
export type HistoryFilter = "ALL" | "EXPENSE" | "INCOME";

export type DayAmounts = { expense: number; income: number; planned: number };

type Tx = { type: string; amount: number };
type Plan = { amount: number; date: string };

export type HistoryRow<T extends Tx, P extends Plan> =
  { kind: "tx"; item: T } | { kind: "planned"; item: P };

/** 날짜("YYYY-MM-DD")별 지출·수입·예정 합계 */
export function dayAmounts<T extends Tx, P extends Plan>(
  txs: T[],
  plans: P[],
  dateOf: (t: T) => string,
) {
  const daily = new Map<string, DayAmounts>();
  const at = (d: string) => {
    const sum = daily.get(d) ?? { expense: 0, income: 0, planned: 0 };
    daily.set(d, sum);
    return sum;
  };
  txs.forEach((t) => {
    const sum = at(dateOf(t));
    if (t.type === "INCOME") sum.income += t.amount;
    else sum.expense += t.amount;
  });
  plans.forEach((p) => {
    at(p.date).planned += p.amount;
  });
  return daily;
}

/**
 * 목록 묶음: 최근 날짜가 위, 같은 날짜에서는 실제 거래 뒤에 예정 지출. 예정은 지출이라 전체·지출 보기에만 나온다.
 */
export function historyGroups<T extends Tx, P extends Plan>(
  txs: T[],
  plans: P[],
  filter: HistoryFilter,
  dateOf: (t: T) => string,
) {
  const groups = new Map<string, HistoryRow<T, P>[]>();
  const add = (d: string, row: HistoryRow<T, P>) =>
    groups.set(d, [...(groups.get(d) ?? []), row]);
  txs
    .filter((t) => filter === "ALL" || t.type === filter)
    .forEach((t) => add(dateOf(t), { kind: "tx", item: t }));
  if (filter !== "INCOME") {
    plans.forEach((p) => add(p.date, { kind: "planned", item: p }));
  }
  return [...groups]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(
      ([date, rows]) =>
        [
          date,
          [
            ...rows.filter((r) => r.kind === "tx"),
            ...rows.filter((r) => r.kind === "planned"),
          ],
        ] as [string, HistoryRow<T, P>[]],
    );
}
