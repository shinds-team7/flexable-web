// F7 v2 목표 달성 시나리오(POST /goal/scenarios, docs/policies.md §7). 금액·확률·비중은 모두 서버 계산 결과를 그대로 쓴다(ADR-3).
// 조합은 AI가 정할 자리이고, AI 연결 전에는 서버가 데모 조합을 돌려준다(proposer=DEMO).
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
  fallbackReason: 'AI_UNAVAILABLE' | 'AI_FAILED' | 'AI_REJECTED' | null;
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
