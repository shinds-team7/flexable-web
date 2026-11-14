// F7 목표 달성 시나리오(POST /goal/scenarios, docs/policies.md §7, #431). 금액·확률·비중은 모두 서버 계산 결과를 그대로 쓴다(ADR-3).
// 시작 금액·월 납입 가능액·기한(목표 금액 선택)으로 안정·균형·적극 세 조합을 계산한다. 조합은 worker가 기한마다 미리 만든 AI 조합이고
// 비회원·횟수 초과·준비 전에는 서버가 데모 조합을 돌려준다(proposer=DEMO, §7-6).
// 회원은 계산 결과의 플랜 전체를 그때 값 그대로 이름을 붙여 최대 5개 저장한다(policies §7-8, /me/goal/scenarios). 저장은 resultId(서버 30분 보관)로만 한다.
import { api } from '@/lib/api';

export type ScenarioProductType = 'SAVINGS' | 'CMA' | 'KR_INDEX_ETF' | 'US_INDEX_ETF' | 'KOSPI_TOP5';

/**
 * startAmount는 시작 금액(0~10억 원), monthlyBudget은 월 납입 가능액(1만~1,000만 원, 천 원 단위), months는 기한(개월, 6~60).
 * targetAmount는 목표 금액(선택). 비우면 보내지 않는다(policies §7-1).
 */
export type GoalScenarioRequest = { startAmount: number; monthlyBudget: number; months: number; targetAmount?: number | null };

export type ScenarioProduct = {
  type: ScenarioProductType;
  items: { code: string | null; name: string; company: string | null }[];
  ratePercent: string | null;
  isSample: boolean;
  /** 함께 볼 상품. 금액 계산에는 쓰지 않는다(policies §7-2). */
  alternatives: { code: string; name: string; company: string | null; ratePercent: string | null }[];
  /** 적금 만기 개월(적금만). 기한보다 짧으면 만기 뒤 남은 달은 CMA 예시 금리로 계산했다(policies §7-2). */
  termMonths: number | null;
};

export type ScenarioOutcome = {
  kind: 'FIXED' | 'RANGE';
  fixedAmount: number | null;
  low: number | null;
  median: number | null;
  high: number | null;
  /** 잘 풀릴 때 수익 = 상위 10%(확정형은 확정 금액) − 넣은 돈. 음수일 수 있다 */
  highGain: number | null;
  /** 목표 금액 이상인 경로 비율(만분율). 목표가 없으면 null */
  chanceBp: number | null;
  lossBp: number;
};

/** 그래프 한 점: month달 말(0은 시작)의 하위 10%·중간값·상위 10%(policies §7-5). */
export type SeriesPoint = { month: number; low: number; median: number; high: number };

/** 해설 네 칸(policies §7-6). 걸린 문장을 지워 빈 칸은 ''이다. */
export type ExplanationParts = { reason: string; roles: string; comparison: string; fit: string };

export type GoalScenario = {
  /** stable·balanced·active(#431 전 저장본은 옛 id) */
  id: string;
  title: string;
  summary: string;
  /** 네 칸을 합친 문단. explanationParts가 null인 옛 저장본은 이것만 보여 준다. */
  explanation: string;
  explanationParts: ExplanationParts | null;
  /** 서버가 정해 둔 문장에 계산값을 넣은 결과 문장(policies §7-5). */
  resultText: string;
  /** start는 유형별 시작 금액 몫(#431 전 저장본은 null) */
  mix: { type: ScenarioProductType; ratioPercent: number; monthly: number | null; start: number | null }[];
  /** 월 금액(= 월 납입 가능액). #431 전 저장본은 그때의 필요 월 금액 */
  monthly: number | null;
  /** 넣은 돈 = 시작 금액 + 월 금액 × 개월 */
  paid: number | null;
  /** #431 전 저장본의 찾지 못한 플랜만 null */
  outcome: ScenarioOutcome | null;
  /** 달마다의 결과 범위. #431 전 저장본은 null */
  series: SeriesPoint[] | null;
};

export type GoalScenarioResult = {
  resultId: string;
  startAmount: number;
  monthlyBudget: number;
  months: number;
  /** 입력한 목표 금액. 넣지 않았으면 null */
  targetAmount: number | null;
  proposer: 'AI' | 'DEMO';
  fallbackReason: ScenarioFallbackReason | null;
  asOf: string;
  returnsFrom: string;
  returnsTo: string;
  paths: number;
  seed: number;
  products: ScenarioProduct[];
  scenarios: GoalScenario[];
  assumptions: string[];
  notice: string;
  isSample: boolean;
  aiUsage: { limitPerDay: number; remainingToday: number } | null;
  /** 같은 회원이 같은 조건으로 이미 본 AI 조합을 다시 보여 줬으면 true(횟수 차감 없음) */
  aiReused: boolean;
};

export type ScenarioFallbackReason = 'AI_UNAVAILABLE' | 'GUEST' | 'AI_PENDING' | 'LIMIT' | 'AI_REJECTED';

/** 데모 조합으로 바꾼 이유를 화면 문구로. */
export const FALLBACK_TEXT: Record<ScenarioFallbackReason, string> = {
  AI_UNAVAILABLE: 'AI 연결 전이라 예시 조합을 보여 드려요.',
  GUEST: '로그인하면 기간에 맞춘 AI 조합을 받을 수 있어요. 지금은 예시 조합이에요.',
  AI_PENDING: '이 기간의 AI 조합을 준비하고 있어요. 지금은 예시 조합을 보여 드려요.',
  LIMIT: '오늘 AI 조합 횟수를 다 썼어요. 내일 다시 받을 수 있고, 지금은 예시 조합이에요.',
  AI_REJECTED: 'AI가 낸 조합이 기준에 맞지 않아 예시 조합을 보여 드려요.',
};

export type SavedScenarioSummary = {
  id: number;
  savedAt: string;
  name: string;
  startAmount: number;
  /** 월 금액. #431 전 저장본은 그때의 필요 월 금액(찾지 못했으면 null) */
  monthlyBudget: number | null;
  months: number;
  targetAmount: number | null;
  asOf: string;
  title: string;
  kind: 'FIXED' | 'RANGE' | null;
};

export type SavedScenarioList = { items: SavedScenarioSummary[]; limit: number };

export type SavedGoalScenario = {
  id: number;
  savedAt: string;
  name: string;
  startAmount: number;
  monthlyBudget: number | null;
  months: number;
  targetAmount: number | null;
  proposer: 'AI' | 'DEMO';
  asOf: string;
  returnsFrom: string;
  returnsTo: string;
  paths: number;
  products: ScenarioProduct[];
  /** 저장할 때 고른 플랜. 다시 볼 때 먼저 보여 준다 */
  scenario: GoalScenario;
  /** 같은 결과의 나머지 플랜. 플랜 하나만 저장하던 때의 저장본은 빈 배열 */
  alternatives: GoalScenario[];
  assumptions: string[];
  notice: string;
  isSample: boolean;
};

/** name은 저장할 때 적는 이름(1~20자). */
export type SaveScenarioRequest = { resultId: string; scenarioId: string; name: string };

export const listSavedScenarios = () => api<SavedScenarioList>('/me/goal/scenarios');
export const getSavedScenario = (id: number) => api<SavedGoalScenario>(`/me/goal/scenarios/${id}`);
export const saveScenario = (q: SaveScenarioRequest) => api<SavedGoalScenario>('/me/goal/scenarios', { method: 'POST', json: q });
export const deleteSavedScenario = (id: number) => api<void>(`/me/goal/scenarios/${id}`, { method: 'DELETE' });

export const fetchGoalScenarios = (q: GoalScenarioRequest) =>
  api<GoalScenarioResult>('/goal/scenarios', { method: 'POST', json: q });

/** 상품 유형별 화면 이름. 실제 상품명은 응답의 products에서 읽는다. */
export const TYPE_LABEL: Record<ScenarioProductType, string> = {
  SAVINGS: '적금',
  CMA: 'CMA',
  KR_INDEX_ETF: '국내 대표 지수 ETF',
  US_INDEX_ETF: '미국 대표 지수 ETF',
  KOSPI_TOP5: '코스피 상위 5종목',
};

export const GOAL_LIMITS = {
  nameMax: 20, startMax: 1_000_000_000, targetMin: 1_000_000, targetMax: 1_000_000_000,
  monthsMin: 6, monthsMax: 60, budgetMin: 10_000, budgetMax: 10_000_000, budgetUnit: 1_000,
};

/** 개월 수를 "6개월"·"1년 6개월"·"2년"으로. */
export function periodText(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y}년` : '', m ? `${m}개월` : ''].filter(Boolean).join(' ') || '0개월';
}
