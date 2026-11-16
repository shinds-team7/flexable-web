import type { PaymentNotice } from "./native";
import { parseShinhanNotice, type PaymentParse } from "./parse";
import { CARD_BRAND_NAMES, parseCardNotice, type CardBrand } from "./cards";

export const SHINHAN_PACKAGE = "com.shcard.smartpay";

/**
 * 자동 기록하는 카드 앱 패키지와 그 카드사. 여기에 더하면 네이티브 리스너도 그 앱 알림을 모으기 시작한다(setSources).
 * 신한 외 패키지 이름은 Play 스토어 앱 이름으로 넣은 것이고 2026-11-14 기준 실기기로 확인하지 않았다.
 * 개발자용 알림 원문 확인에 다른 패키지가 보이면 여기를 고친다(결정 2026-11-14 8·9).
 * 카카오뱅크처럼 은행 앱은 넣지 않는다(이체·입출금 알림까지 모이므로, 결정 6·9).
 */
export const CARD_PACKAGES: Record<string, CardBrand> = {
  "kr.co.samsungcard.mpocket": "SAMSUNG", // 삼성카드
  "com.hyundaicard.appcard": "HYUNDAI", // 현대카드
  "com.kbcard.cxh.appcard": "KB", // KB Pay
  "com.lcacApp": "LOTTE", // 롯데카드(디지로카)
  "nh.smart.nhallonepay": "NH", // NH pay(2025-03 NH농협카드 앱을 통합)
};

export function parsePaymentNotice(notice: PaymentNotice): PaymentParse {
  const name = notice.packageName || SHINHAN_PACKAGE;
  if (name === SHINHAN_PACKAGE) return parseShinhanNotice(notice);
  const brand = CARD_PACKAGES[name];
  return brand
    ? parseCardNotice(brand, notice)
    : { reason: "지원하지 않는 카드 앱 알림이에요" };
}

export function extraPaymentSources(): string[] {
  return Object.keys(CARD_PACKAGES);
}

/** 자동 기록 메모에 적는 카드사 이름 */
export function paymentSourceName(notice: PaymentNotice): string {
  const brand = CARD_PACKAGES[notice.packageName || SHINHAN_PACKAGE];
  return brand ? CARD_BRAND_NAMES[brand] : "신한카드";
}
