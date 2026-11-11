// F7 v2 목표 달성 시나리오(POST /goal/scenarios, docs/policies.md §7). 금액·확률·비중은 모두 서버 계산 결과를 그대로 쓴다(ADR-3).
// 조합은 로그인한 회원이면 AI(OpenAI)가 정하고, 비회원·횟수 초과·실패 때는 서버가 데모 조합을 돌려준다(proposer=DEMO, §7-6).
// 회원은 계산 결과의 플랜 전체를 그때 값 그대로 최대 5개 저장한다(policies §7-8, /me/goal/scenarios). 저장은 resultId(서버 30분 보관)로만 한다.
import { api } from '@/lib/api';

export type ScenarioProductType = 'SAVINGS' | 'CMA' | 'KR_INDEX_ETF' | 'US_INDEX_ETF' | 'KOSPI_TOP5';

/**
 * months는 기한(개월, 6~60). 화면은 연·월로 받아 개월로 보낸다(policies §7-1).
 * monthlyBudget은 월 납입 가능액(선택, 천 원 단위, 1만 원~목표 금액). 비우면 보내지 않는다.
 */
export type GoalScenarioRequest = { name: string; targetAmount: number; months: number; monthlyBudget?: number | null };

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
  chanceBp: number;
  lossBp: number;
};

/** 해설 네 칸(policies §7-6). 걸린 문장을 지워 빈 칸은 ''이다. */
export type ExplanationParts = { reason: string; roles: string; comparison: string; fit: string };

export type GoalScenario = {
  id: string;
  title: string;
  summary: string;
  /** 네 칸을 합친 문단. explanationParts가 null인 옛 재사용 조합·옛 저장본은 이것만 보여 준다. */
  explanation: string;
  explanationParts: ExplanationParts | null;
  /** 서버가 정해 둔 문장에 계산값을 넣은 결과 문장(policies §7-5). */
  resultText: string;
  mix: { type: ScenarioProductType; ratioPercent: number; monthly: number | null }[];
  reachable: boolean;
  monthly: number | null;
  paid: number | null;
  outcome: ScenarioOutcome | null;
  /** 필요 월 금액이 월 납입 가능액 이하면 true, 넘거나 월 금액을 찾지 못했으면 false. 가능액이 없거나 옛 저장본이면 null(policies §7-5). */
  withinBudget: boolean | null;
  /** 필요 월 금액 − 가능액(가능액을 넘고 월 금액을 찾았을 때만). */
  overBudgetBy: number | null;
};

export type GoalScenarioResult = {
  resultId: string;
  name: string;
  targetAmount: number;
  months: number;
  /** 입력한 월 납입 가능액. 넣지 않았으면 null */
  monthlyBudget: number | null;
  proposer: 'AI' | 'DEMO';
  fallbackReason: ScenarioFallbackReason | null;
  asOf: string;
  returnsFrom: string;
  returnsTo: string;
  paths: number;
  seed: number;
  reachShare: number;
  products: ScenarioProduct[];
  scenarios: GoalScenario[];
  assumptions: string[];
  notice: string;
  isSample: boolean;
  aiUsage: { limitPerDay: number; remainingToday: number } | null;
  /** 같은 회원이 같은 조건으로 받은 이전 AI 조합을 다시 썼으면 true(횟수 차감 없음) */
  aiReused: boolean;
};

export type ScenarioFallbackReason = 'AI_UNAVAILABLE' | 'GUEST' | 'LIMIT' | 'DAILY_CAP' | 'AI_FAILED' | 'AI_REJECTED';

/** 데모 조합으로 바꾼 이유를 화면 문구로. */
export const FALLBACK_TEXT: Record<ScenarioFallbackReason, string> = {
  AI_UNAVAILABLE: 'AI 연결 전이라 예시 조합을 보여 드려요.',
  GUEST: '로그인하면 목표에 맞춘 AI 조합을 받을 수 있어요. 지금은 예시 조합이에요.',
  LIMIT: '오늘 AI 조합 횟수를 다 썼어요. 내일 다시 받을 수 있고, 지금은 예시 조합이에요.',
  DAILY_CAP: '오늘은 AI 이용이 많아 예시 조합을 보여 드려요. 내일 다시 시도해 주세요.',
  AI_FAILED: 'AI 조합을 받지 못해 예시 조합을 보여 드려요. 잠시 뒤 다시 시도해 주세요.',
  AI_REJECTED: 'AI가 낸 조합이 기준에 맞지 않아 예시 조합을 보여 드려요.',
};

export type SavedScenarioSummary = {
  id: number;
  savedAt: string;
  name: string;
  targetAmount: number;
  months: number;
  asOf: string;
  title: string;
  reachable: boolean;
  monthly: number | null;
  kind: 'FIXED' | 'RANGE' | null;
};

export type SavedScenarioList = { items: SavedScenarioSummary[]; limit: number };

export type SavedGoalScenario = {
  id: number;
  savedAt: string;
  name: string;
  targetAmount: number;
  months: number;
  /** 저장할 때 넣은 월 납입 가능액. 넣지 않았거나 옛 저장본이면 null */
  monthlyBudget: number | null;
  proposer: 'AI' | 'DEMO';
  asOf: string;
  returnsFrom: string;
  returnsTo: string;
  paths: number;
  reachShare: number;
  products: ScenarioProduct[];
  /** 저장할 때 고른 플랜. 다시 볼 때 먼저 보여 준다 */
  scenario: GoalScenario;
  /** 같은 결과의 나머지 플랜. 플랜 하나만 저장하던 때의 저장본은 빈 배열 */
  alternatives: GoalScenario[];
  assumptions: string[];
  notice: string;
  isSample: boolean;
};

export type SaveScenarioRequest = { resultId: string; scenarioId: string };

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

/** 입력을 빨리 채우는 예시(결과는 서버가 계산한다). */
export const GOAL_PRESETS: { id: string; chip: string; name: string; amount: number; months: number }[] = [
  { id: 'y1', chip: '1년 · 1,500만 원', name: '1년 안에 목돈 만들기', amount: 15_000_000, months: 12 },
  { id: 'y2', chip: '2년 · 3,000만 원', name: '2년 뒤 전세 보증금 보태기', amount: 30_000_000, months: 24 },
  { id: 'y3', chip: '3년 · 5,000만 원', name: '3년 뒤 5,000만 원', amount: 50_000_000, months: 36 },
];

export const GOAL_LIMITS = { nameMax: 20, amountMin: 1_000_000, amountMax: 1_000_000_000, monthsMin: 6, monthsMax: 60, budgetMin: 10_000, budgetUnit: 1_000 };

/** 개월 수를 "6개월"·"1년 6개월"·"2년"으로. */
export function periodText(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y}년` : '', m ? `${m}개월` : ''].filter(Boolean).join(' ') || '0개월';
}
