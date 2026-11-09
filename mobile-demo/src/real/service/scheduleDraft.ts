// 음성·AI 메이트가 제안한 예정 지출 한 줄 카드(날짜 · 금액 · 카테고리)의 규칙.
// 외부 모듈을 쓰지 않아 단위 테스트(test/schedule-draft.test.cjs)에서 바로 돌린다.

export type ScheduleDraft = {
  date: string;
  /** 예측하지 못했거나 사용자가 지웠으면 null */
  amount: number | null;
  categoryId: number;
};

const MAX_AMOUNT = 999_999_999_999;

export function validAmount(amount: number | null): amount is number {
  return (
    amount != null &&
    Number.isInteger(amount) &&
    amount >= 1 &&
    amount <= MAX_AMOUNT
  );
}

export function draftEdited(initial: ScheduleDraft, current: ScheduleDraft) {
  return (
    initial.date !== current.date ||
    initial.amount !== current.amount ||
    initial.categoryId !== current.categoryId
  );
}

/**
 * [반영 | 수정] 중 누를 수 있는 것. 처음엔 [반영]만 켜지고, 하나라도 고치면 [반영]이 꺼지고 [수정]이 켜진다.
 * 금액을 예측하지 못한 카드는 처음엔 둘 다 꺼져 있고, 금액을 넣으면 [수정]으로 등록한다.
 */
export function draftButtons(initial: ScheduleDraft, current: ScheduleDraft) {
  const edited = draftEdited(initial, current);
  return {
    apply: !edited && validAmount(current.amount),
    edit: edited && validAmount(current.amount),
  };
}

/** 숫자만 남긴 금액. 비면 null */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, "").slice(0, 12);
  if (!digits) return null;
  const n = Number(digits);
  return n > 0 ? n : null;
}

/** 받침이 있으면 "으로", 없거나 ㄹ 받침이면 "로" */
export function withRo(word: string) {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}로`;
  const jong = code % 28;
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`;
}

/**
 * AI 음성 답변으로 읽는 확인 질문. 예정 지출 확인 질문만 읽는다(긴 예산 설명은 읽지 않는다).
 * "11월 7일에 데이트로 56,200원을 등록할까요?"
 */
export function confirmSpeech(s: {
  title: string;
  date: string;
  amount: number | null;
}) {
  const [, m, d] = s.date.split("-").map(Number);
  const when = `${m}월 ${d}일`;
  if (!validAmount(s.amount))
    return `${when} ${s.title}에 쓸 금액을 알려 주세요.`;
  return `${when}에 ${withRo(s.title)} ${s.amount.toLocaleString("en-US")}원을 등록할까요?`;
}
