import { validDate } from "../occurredAt";
import type { PaymentNotice } from "./native";

export type PaymentApproval = {
  title: string;
  amount: number;
  occurredAt: string;
};
export type PaymentParse =
  | { approval: PaymentApproval; reason?: never }
  | { approval?: never; reason: string };

/** Conservative domestic approval parser. Never infer an amount from a cumulative total, foreign currency or cancellation. */
export function parseShinhanNotice(notice: PaymentNotice): PaymentParse {
  const text = `${notice.title}\n${notice.body}`.replace(/\r/g, "");
  const reject = (reason: string): PaymentParse => ({ reason });
  if (
    /취소|거절|실패|해외|USD|US\$|JPY|EUR|달러|엔화|승인번호|인증번호|OTP/i.test(
      text,
    )
  )
    return reject("취소·해외 이용 또는 확인이 필요한 알림이에요");
  if (!/신한/.test(text) || !/승인/.test(text))
    return reject("결제 승인 알림인지 확인해 주세요");
  const lines = text
    .split("\n")
    // SOL Pay's expanded debit notice prefixes its labelled fields with "- ".
    .map((line) =>
      line
        .trim()
        .replace(
          /^-\s+(?=승인\s*(?:금액|일시)\s*[:：]|(?:가맹점(?:명)?|이용처)\s*[:：])/,
          "",
        ),
    )
    .filter(Boolean);
  const amounts = lines.flatMap((line, index) => {
    if (/누적|합계|잔액|한도|예정|청구/.test(line)) return [];
    const match = line.match(
      /^(?:승인\s*금액\s*[:：]?\s*)?(\d{1,3}(?:,\d{3})*|\d+)\s*원(?:\s+(?:일시불|\d{1,2}개월|체크))?$/,
    );
    return match ? [{ amount: Number(match[1].replace(/,/g, "")), index }] : [];
  });
  if (
    amounts.length !== 1 ||
    amounts[0].amount < 1 ||
    amounts[0].amount > 999999999999
  )
    return reject("결제 금액을 정확히 읽지 못했어요");
  const dateMatches = [
    ...text.matchAll(
      /(?:^|\s)(\d{1,2})[/.](\d{1,2})\s+(\d{1,2}):(\d{2})(?=\s|$)/g,
    ),
  ];
  if (dateMatches.length !== 1)
    return reject("결제 일시를 정확히 읽지 못했어요");
  const [, month, day, hour, minute] = dateMatches[0];
  const posted = new Date(notice.postedAt + 9 * 3600000);
  if (
    Number.isNaN(posted.getTime()) ||
    Number(hour) > 23 ||
    Number(minute) > 59
  )
    return reject("결제 일시를 확인해 주세요");
  const pad = (s: string) => s.padStart(2, "0");
  const candidates = [posted.getUTCFullYear(), posted.getUTCFullYear() - 1].map(
    (year) =>
      `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${minute}:00+09:00`,
  );
  const occurredAt = candidates.find(
    (iso) =>
      validDate(iso.slice(0, 10)) &&
      notice.postedAt - Date.parse(iso) >= -5 * 60000 &&
      notice.postedAt - Date.parse(iso) <= 48 * 3600000,
  );
  if (!occurredAt) return reject("알림의 결제 일시를 확인해 주세요");
  // Supported templates put a merchant on its own line, or explicitly label it.
  const explicit = lines
    .filter((line) => /^(?:가맹점(?:명)?|이용처)\s*[:：]/.test(line))
    .map((line) => line.replace(/^(?:가맹점(?:명)?|이용처)\s*[:：]\s*/, ""));
  const plain = lines.filter(
    (line) =>
      !/신한|승인|님|카드|누적|합계|잔액|한도|예정|청구|일시불|개월|체크|\d{1,2}[/.]\d{1,2}|\d+\s*원|\*|^\[/.test(
        line,
      ),
  );
  const merchants = explicit.length ? explicit : plain;
  if (merchants.length !== 1 || !merchants[0] || merchants[0].length > 40)
    return reject("가맹점 이름을 정확히 읽지 못했어요");
  return {
    approval: { title: merchants[0], amount: amounts[0].amount, occurredAt },
  };
}
