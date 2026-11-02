import { normalizeTitle } from "../receiptImport/review";
import { parseShinhanNotice } from "./parse";
import type { PaymentNotice } from "./native";

export type PaymentBody = {
  type: "EXPENSE";
  title: string;
  amount: number;
  categoryId: number;
  occurredAt: string;
  memo: string;
};
type Existing = {
  type: string;
  title: string;
  amount: number;
  occurredAt: string;
};
export type ImportDependencies = {
  current(): boolean;
  category(): Promise<number | null>;
  existing(date: string): Promise<Existing[]>;
  prepare(id: string, body: PaymentBody): Promise<PaymentBody>;
  save(id: string, body: PaymentBody): Promise<void>;
  acknowledge(id: string): Promise<void>;
};
export type PaymentProblem = { id: string; reason: string; postedAt: number };

/** Persist the exact request BEFORE sending it. Retried requests keep the same body and idempotency key. */
export async function importPaymentNotices(
  notices: PaymentNotice[],
  deps: ImportDependencies,
) {
  const problems: PaymentProblem[] = [];
  let saved = 0;
  for (const notice of notices) {
    if (!deps.current()) break;
    let body: PaymentBody;
    if (notice.prepared) body = JSON.parse(notice.prepared) as PaymentBody;
    else {
      const parsed = parseShinhanNotice(notice);
      if (!parsed.approval) {
        problems.push({
          id: notice.id,
          reason: parsed.reason,
          postedAt: notice.postedAt,
        });
        continue;
      }
      const approval = parsed.approval;
      const categoryId = await deps.category();
      if (!deps.current()) break;
      if (!categoryId) {
        problems.push({
          id: notice.id,
          postedAt: notice.postedAt,
          reason: "지출의 기본 기타 카테고리를 확인해 주세요",
        });
        continue;
      }
      const existing = await deps.existing(approval.occurredAt.slice(0, 10));
      if (!deps.current()) break;
      if (
        existing.some(
          (item) =>
            item.type === "EXPENSE" &&
            item.amount === approval.amount &&
            normalizeTitle(item.title) === normalizeTitle(approval.title) &&
            Math.abs(
              Date.parse(item.occurredAt) - Date.parse(approval.occurredAt),
            ) < 60000,
        )
      ) {
        problems.push({
          id: notice.id,
          postedAt: notice.postedAt,
          reason:
            "같은 시각·가맹점·금액의 거래가 있어요. 중복인지 확인해 주세요",
        });
        continue;
      }
      body = await deps.prepare(notice.id, {
        ...approval,
        type: "EXPENSE",
        categoryId,
        memo: "신한카드 결제 알림에서 자동 기록",
      });
    }
    if (!deps.current()) break;
    await deps.save(notice.id, body);
    if (!deps.current()) break;
    await deps.acknowledge(notice.id);
    saved++;
  }
  return { saved, problems };
}
