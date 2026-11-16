import type { DevCapture, PaymentNotice } from "./native";

/**
 * 개발자용 알림 원문을 공유하기 전에 사람·카드를 알아볼 수 있는 부분을 가린다.
 * 파서에 필요한 금액(쉼표·원), 날짜·시각, 줄바꿈·공백은 그대로 둔다. 완벽하지 않으므로 공유 전에 눈으로 확인한다.
 */
export function maskNoticeText(text: string): string {
  return (
    text
      // 휴대폰 번호
      .replace(/01[016789][- ]?\d{3,4}[- ]?\d{4}/g, "010-****-****")
      // "홍길동님", "홍*동님"처럼 님 앞의 이름
      .replace(/[가-힣A-Za-z*]{1,10}(?=\s?님)/g, (m) => "○".repeat(m.length))
      // "가*나", "강*혜"처럼 가운데를 가린 이름
      .replace(/[가-힣]\*+[가-힣]?/g, (m) => "○".repeat(m.length))
      // 괄호 안 카드 번호 일부 "(1234)", "(9*0*)"
      .replace(
        /\((?=[\d*]*\d)[\d*]{2,8}\)/g,
        (m) => `(${"*".repeat(m.length - 2)})`,
      )
      // 별표가 섞인 카드 번호 조각 "2*5*", "1234-****-****-5678"
      .replace(/\d[\d*-]*\*[\d*-]*/g, (m) => m.replace(/\d/g, "*"))
      .replace(/\*[\d*-]*\d[\d*-]*/g, (m) => m.replace(/\d/g, "*"))
      // 쉼표 없는 8자리 이상 숫자(계좌·카드·승인 번호)
      .replace(/\d{8,}/g, (m) => "*".repeat(m.length))
  );
}

/** 공유용 JSON. 줄바꿈·공백이 그대로 보이도록 각 필드를 문자열로 이스케이프한다 */
export function maskedCaptureJson(item: DevCapture): string {
  return JSON.stringify(
    {
      packageName: item.packageName,
      postedAt: new Date(item.postedAt).toISOString(),
      summary: item.summary,
      ongoing: item.ongoing,
      title: maskNoticeText(item.title),
      text: maskNoticeText(item.text),
      bigText: maskNoticeText(item.bigText),
      textLines: maskNoticeText(item.textLines),
      subText: maskNoticeText(item.subText),
    },
    null,
    2,
  );
}

/** 자동 기록 확인 목록에서 읽지 못한 카드 알림을 공유할 때 쓰는 JSON(이름·카드번호를 가림) */
export function maskedNoticeJson(notice: PaymentNotice): string {
  return JSON.stringify(
    {
      packageName: notice.packageName ?? "com.shcard.smartpay",
      postedAt: new Date(notice.postedAt).toISOString(),
      title: maskNoticeText(notice.title),
      body: maskNoticeText(notice.body),
    },
    null,
    2,
  );
}
