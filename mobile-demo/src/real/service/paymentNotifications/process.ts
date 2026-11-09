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
  /** Notices the server already rejected in this session, by id. Not resent until the app restarts. */
  rejected: Map<string, string>;
};
export type PaymentProblem = { id: string; reason: string; postedAt: number };

/** The native id is a 64-char SHA-256 hex digest, exactly the server's Idempotency-Key limit (64). Send it as is, never prefixed. */
export const paymentIdempotencyKey = (id: string) => id;

/** Rejections that resending the same body can never fix (e.g. the fixed category was deleted). Anything else stops the run and retries later. */
export function rejectionReason(error: unknown) {
  const { code, message } = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
  };
  if (code !== "VALIDATION_FAILED" && code !== "NOT_FOUND") return undefined;
  return `자동 기록하지 못했어요${typeof message === "string" && message ? `(${message})` : ""}`;
}

/** Persist the exact request BEFORE sending it. Retried requests keep the same body and idempotency key. */
export async function importPaymentNotices(
  notices: PaymentNotice[],
  deps: ImportDependencies,
) {
  const problems: PaymentProblem[] = [];
  let saved = 0;
  for (const notice of notices) {
    if (!deps.current()) break;
    const rejected = deps.rejected.get(notice.id);
    if (rejected) {
      problems.push({
        id: notice.id,
        postedAt: notice.postedAt,
        reason: rejected,
      });
      continue;
    }
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
    try {
      await deps.save(notice.id, body);
    } catch (error) {
      // One permanently rejected notice must not block every later one. It stays queued (not acknowledged) for the user to exclude.
      const reason = rejectionReason(error);
      if (!reason) throw error;
      deps.rejected.set(notice.id, reason);
      problems.push({ id: notice.id, postedAt: notice.postedAt, reason });
      continue;
    }
    if (!deps.current()) break;
    await deps.acknowledge(notice.id);
    saved++;
  }
  return { saved, problems };
}
