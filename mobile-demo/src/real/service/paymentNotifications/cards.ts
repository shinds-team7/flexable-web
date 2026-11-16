import type { PaymentNotice } from "./native";
import { resolveOccurredAt, type PaymentParse } from "./parse";

/**
 * 신한 외 카드사 결제 승인 알림 파서(삼성·현대·KB국민·롯데·NH농협).
 *
 * 2026-11-14 기준 실제 앱 푸시 원문이 없어 외부 조사의 공개 SMS 예시(줄바꿈 형식·한 줄 형식) 모양으로 만들었다.
 * 실제 알림이 다르면 개발자용 알림 원문 확인으로 모은 원문을 테스트에 더하고 고친다(결정 2026-11-14).
 * 신한 파서와 같이 보수적으로 읽는다: 취소·해외·누적만 있는 금액·금액 여러 개·가맹점 불명확은 기록하지 않는다.
 */
export type CardBrand = "SAMSUNG" | "HYUNDAI" | "KB" | "LOTTE" | "NH";

export const CARD_BRAND_NAMES: Record<CardBrand, string> = {
  SAMSUNG: "삼성카드",
  HYUNDAI: "현대카드",
  KB: "KB국민카드",
  LOTTE: "롯데카드",
  NH: "NH농협카드",
};

/** 알림 머리(카드사 이름이 든 첫 낱말·줄)를 알아보는 기준 */
const BRAND: Record<CardBrand, RegExp> = {
  SAMSUNG: /삼성\S*카드/,
  HYUNDAI: /현대카드/,
  KB: /KB\s?국민카드|KB국민|국민카드/,
  LOTTE: /롯데\S*카드|^롯데\S*\(/m,
  // 농협BC(1*2*), NH농협카드, NH채움. 농협 출금처럼 은행 계좌 알림은 승인·일시불·할부가 없어 아래에서 거른다.
  NH: /농협\S*(카드|BC|\()|NH\s?(농협|채움)/,
};

const REJECT =
  /취소|거절|실패|해외|USD|US\$|JPY|EUR|달러|엔화|승인번호|인증번호|OTP|한도초과|잔액부족/i;
const AMOUNT = /(\d{1,3}(?:,\d{3})+|\d+)\s*원/g;
const CUMULATIVE = /(누적|합계|잔액|한도|결제예정|청구)(금액|액)?\s*[:：]?\s*$/;
const DATE_TIME =
  /(?:^|\s)(\d{1,2})[/.](\d{1,2})\s+(\d{1,2}):(\d{2})(?=\.?(\s|$))/g;
/** 가맹점이 아닌 낱말: 이름(님), 가린 번호·이름(별표), 할부, 승인 표시, 발신 표시 */
const NOT_MERCHANT = [
  /\[Web발신\]/g,
  /[가-힣A-Za-z*]{1,10}\s?님/g,
  /\S*\*\S*/g,
  /\(?(일시불|\d{1,2}\s?개월|할부|체크)\)?/g,
  /(누적|합계|잔액|한도)(금액|액)?\s*[:：]?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*원/g,
  /(\d{1,3}(?:,\d{3})+|\d+)\s*원/g,
  /(\d{1,2})[/.](\d{1,2})\s+(\d{1,2}):(\d{2})/g,
  /^-?\s*승인\s*$/g,
];

export function parseCardNotice(
  brand: CardBrand,
  notice: PaymentNotice,
): PaymentParse {
  const reject = (reason: string): PaymentParse => ({ reason });
  const text = `${notice.title}\n${notice.body}`.replace(/\r/g, "");
  if (REJECT.test(text))
    return reject("취소·해외 이용 또는 확인이 필요한 알림이에요");
  if (!BRAND[brand].test(text) || !/승인|일시불|\d\s?개월|할부/.test(text))
    return reject("결제 승인 알림인지 확인해 주세요");

  // 금액: 누적·잔액 같은 말 바로 뒤의 금액은 빼고, 남은 금액이 정확히 하나여야 한다.
  const amounts = [...text.matchAll(AMOUNT)].filter(
    (m) => !CUMULATIVE.test(text.slice(Math.max(0, m.index! - 8), m.index!)),
  );
  const amount =
    amounts.length === 1 ? Number(amounts[0][1].replace(/,/g, "")) : 0;
  if (!amount || amount > 999999999999)
    return reject("결제 금액을 정확히 읽지 못했어요");

  // 일시: "MM/DD HH:mm"이 하나 있으면 그것, 없으면(현대카드 예시처럼) 알림을 받은 시각(분 단위).
  const dates = [...text.matchAll(DATE_TIME)];
  if (dates.length > 1) return reject("결제 일시를 정확히 읽지 못했어요");
  let occurredAt: string | null;
  if (dates.length === 1) {
    const [, month, day, hour, minute] = dates[0];
    occurredAt = resolveOccurredAt(month, day, hour, minute, notice.postedAt);
  } else {
    const posted = new Date(notice.postedAt + 9 * 3600000);
    occurredAt = Number.isNaN(posted.getTime())
      ? null
      : `${posted.toISOString().slice(0, 16)}:00+09:00`;
  }
  if (!occurredAt) return reject("알림의 결제 일시를 확인해 주세요");

  // 가맹점: 카드사 머리·이름·번호·금액·일시·누적을 지우고 남은 글자가 정확히 한 덩어리여야 한다.
  const merchants = text
    .split("\n")
    .map((line) => {
      let rest = line.trim();
      // 머리 낱말("신한카드승인", "[현대카드]-승인", "삼성가족카드승인9785")은 금액보다 앞에 있을 때만 지운다.
      const amountAt = rest.search(/\d[\d,]*\s*원/);
      const head = amountAt < 0 ? rest : rest.slice(0, amountAt);
      const tail = amountAt < 0 ? "" : rest.slice(amountAt);
      rest =
        head
          .split(/\s+/)
          .filter((word) => !isBrandWord(brand, word))
          .join(" ") +
        " " +
        tail;
      for (const pattern of NOT_MERCHANT) rest = rest.replace(pattern, " ");
      // 농협 형식은 줄마다 끝에 마침표를 붙인다("04/14 11:51.", "일시불81,400원.").
      return rest
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^\.+|\.+$/g, "")
        .trim();
    })
    .filter((rest) => rest && !/^(승인|결제|안내|알림|-)+$/.test(rest));
  if (merchants.length !== 1 || merchants[0].length > 40)
    return reject("가맹점 이름을 정확히 읽지 못했어요");
  return { approval: { title: merchants[0], amount, occurredAt } };
}

function isBrandWord(brand: CardBrand, word: string) {
  return (
    BRAND[brand].test(word) ||
    /^\[[^\]]*카드[^\]]*\]/.test(word) ||
    /^(Zero\]?|-?승인\d*|\]?-?승인)$/.test(word)
  );
}
