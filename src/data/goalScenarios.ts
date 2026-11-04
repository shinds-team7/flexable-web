// F7 v2 목표 달성 시나리오(POST /goal/scenarios, docs/policies.md §7). 금액·확률·비중은 모두 서버 계산 결과를 그대로 쓴다(ADR-3).
// 조합은 로그인한 회원이면 AI(OpenAI)가 정하고, 비회원·횟수 초과·실패 때는 서버가 데모 조합을 돌려준다(proposer=DEMO, §7-6).
// 회원은 고른 시나리오를 그때 결과 그대로 최대 5개 저장한다(policies §7-8, /me/goal/scenarios). 저장은 resultId(서버 30분 보관)로만 한다.
import { api } from '@/lib/api';

export type ScenarioProductType = 'SAVINGS' | 'CMA' | 'KR_INDEX_ETF' | 'US_INDEX_ETF' | 'KOSPI_TOP5';

export type GoalScenarioRequest = { name: string; targetAmount: number; years: 1 | 2 | 3 };

export type ScenarioProduct = {
  type: ScenarioProductType;
  items: { code: string | null; name: string; company: string | null }[];
  ratePercent: string | null;
  isSample: boolean;
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

export type GoalScenario = {
  id: string;
  title: string;
  summary: string;
  explanation: string;
  mix: { type: ScenarioProductType; ratioPercent: number; monthly: number | null }[];
  reachable: boolean;
  monthly: number | null;
  paid: number | null;
  outcome: ScenarioOutcome | null;
};

export type GoalScenarioResult = {
  resultId: string;
  name: string;
  targetAmount: number;
  years: number;
  months: number;
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
  years: number;
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
  years: number;
  months: number;
  proposer: 'AI' | 'DEMO';
  asOf: string;
  returnsFrom: string;
  returnsTo: string;
  paths: number;
  reachShare: number;
  products: ScenarioProduct[];
  scenario: GoalScenario;
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
export const GOAL_PRESETS: { id: string; chip: string; name: string; amount: number; years: 1 | 2 | 3 }[] = [
  { id: 'y1', chip: '1년 · 1,500만 원', name: '1년 안에 목돈 만들기', amount: 15_000_000, years: 1 },
  { id: 'y2', chip: '2년 · 3,000만 원', name: '2년 뒤 전세 보증금 보태기', amount: 30_000_000, years: 2 },
  { id: 'y3', chip: '3년 · 5,000만 원', name: '3년 뒤 5,000만 원', amount: 50_000_000, years: 3 },
];

export const GOAL_LIMITS = { nameMax: 20, amountMin: 1_000_000, amountMax: 1_000_000_000 };
