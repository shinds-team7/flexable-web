// 요일별 비중 화면 문구와 드래그 값 변환(docs/policies.md §5). 금액은 서버(GET /budget/today의 dayBudgets)가 준다.
// 타입은 test/day-weights.test.cjs가 그대로 읽을 수 있게 이 파일 안에 적는다.

export type Preset = "EVEN" | "RECORD" | "WEEKEND" | "WEEKDAY" | "CUSTOM";

export const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export const PRESET_LABEL: Record<Preset, string> = {
  EVEN: "기본 배분",
  RECORD: "내 기록 기준",
  WEEKEND: "주말 넉넉히",
  WEEKDAY: "평일 넉넉히",
  CUSTOM: "직접 조정",
};

/** 홈 카드 아래 한 줄 설명 */
export function presetNote(preset: Preset) {
  switch (preset) {
    case "EVEN":
      return "남은 생활비를 모든 요일에 똑같이 나눠요";
    case "RECORD":
      return "기록한 지출이 많았던 요일에 더 나눠요";
    case "WEEKEND":
      return "토·일요일에 더 나눠요";
    case "WEEKDAY":
      return "월~금요일에 더 나눠요";
    case "CUSTOM":
      return "직접 정한 요일 비중대로 나눠요";
  }
}

/** 고르는 화면의 프리셋 설명 */
export const PRESET_DETAIL: Record<Exclude<Preset, "CUSTOM">, string> = {
  EVEN: "모든 요일에 똑같이",
  RECORD: "최근 3개월 안에 기록한 지출을 요일별로 평균 내서",
  WEEKEND: "토·일요일에 더, 금요일에 조금 더",
  WEEKDAY: "월~금요일에 더",
};

type RecordInfo = {
  from?: string | null;
  to: string;
  days: number;
  weekdays: number;
  minDays: number;
  minWeekdays: number;
};

/** "2026-10-03" → "10월 3일" */
function md(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** 내 기록 기준을 쓸 수 있으면 기간, 아니면 무엇이 더 필요한지 */
export function recordHint(r: RecordInfo, available: boolean) {
  if (available && r.from)
    return `${md(r.from)}~${md(r.to)} 기록 ${r.days}일 기준`;
  if (r.days < r.minDays)
    return `지출을 기록한 날이 ${r.minDays - r.days}일 더 있으면 쓸 수 있어요`;
  return `${r.minWeekdays}개 요일 이상 기록이 있으면 쓸 수 있어요`;
}

/** 막대 안에서 손가락 위치(위에서 y, 막대 높이 height) → 비중. 맨 위가 max, 맨 아래가 min */
export function weightAt(y: number, height: number, min: number, max: number) {
  if (!(height > 0)) return min;
  const ratio = 1 - Math.min(1, Math.max(0, y / height));
  return Math.round(min + ratio * (max - min));
}

/** 막대 채움 비율(0~1). min이어도 조금은 보이게 한다 */
export function fillOf(weight: number, min: number, max: number) {
  return 0.12 + (0.88 * (weight - min)) / (max - min);
}

/** 화면에 보여 줄 요일 비중 %(반올림, 표시용) */
export function percents(weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (total > 0 ? Math.round((w / total) * 100) : 0));
}

export function sameWeights(a: number[] | null | undefined, b: number[]) {
  return !!a && a.length === b.length && a.every((v, i) => v === b[i]);
}
