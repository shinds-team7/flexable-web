// AI 목표 달성(웹 백엔드 GET·PUT·DELETE /api/v1/me/goal, POST /me/goal/coach). 계약 정본은 docs/product/goal-ai.md.
// 진행률·필요 금액·시나리오·점검표·AI 문장의 숫자는 모두 서버가 계산한다(ADR-3). 화면은 받은 값을 그리기만 한다.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { todayKst } from '@/lib/deadline';

export type GoalCategory = 'EMERGENCY' | 'TRAVEL' | 'DEVICE' | 'TUITION' | 'HOUSING' | 'OTHER';
export type GoalStatus = 'REACHED' | 'ON_TRACK' | 'BEHIND' | 'NO_PACE' | 'OVERDUE';
export type ScenarioKey = 'KEEP_PACE' | 'MEET_DUE' | 'EXTEND_6';
export type FallbackReason = 'AI_UNAVAILABLE' | 'DAILY_CAP' | 'AI_FAILED' | 'AI_REJECTED';

export const CATEGORIES: { v: GoalCategory; label: string }[] = [
  { v: 'EMERGENCY', label: '비상금' },
  { v: 'TRAVEL', label: '여행' },
  { v: 'DEVICE', label: '전자기기' },
  { v: 'TUITION', label: '등록금·학비' },
  { v: 'HOUSING', label: '독립·보증금' },
  { v: 'OTHER', label: '기타' },
];
export const categoryLabel = (c: GoalCategory) => CATEGORIES.find((x) => x.v === c)?.label ?? '기타';

export type Coach = {
  aiGenerated: boolean;
  model: string | null;
  fallbackReason: FallbackReason | null;
  generatedAt: string;
  /** 저장한 뒤 목표 금액·기한·종류나 시드머니, 기준 달이 바뀜 */
  stale: boolean;
  headline: string;
  summary: string;
  steps: { title: string; detail: string }[];
  noticeKey: 'GOAL_AI';
  notice: string;
};

export type Goal = {
  id: number;
  version: number;
  category: GoalCategory;
  name: string;
  amount: number;
  /** YYYY-MM */
  dueMonth: string;
  currentAmount: number | null;
  monthlyPace: number | null;
  createdAt: string;
  updatedAt: string;
  seed: {
    /** app = 앱에서 확정한 시드머니, manual = 목표 화면에서 직접 넣은 값 */
    source: 'app' | 'manual';
    current: number;
    pace: number | null;
    asOf: string;
    /** 앱 연동이 있으면 앱 시드머니 status, 없으면 null */
    appStatus: 'available' | 'budget_not_set' | 'not_received' | null;
  };
  progress: {
    thisMonth: string;
    current: number;
    remaining: number;
    /** 만분율(0~10000) */
    ratioBp: number;
    /** 기한이 지나면 음수 */
    monthsLeft: number;
    /** OVERDUE면 null */
    requiredMonthly: number | null;
    expectedMonths: number | null;
    expectedMonth: string | null;
    status: GoalStatus;
    monthlyGap: number;
    dailyGap: number;
  };
  scenarios: { key: ScenarioKey; monthly: number; reachMonth: string }[];
  checkpoints: { percent: 25 | 50 | 75 | 100; month: string; target: number }[];
  coach: Coach | null;
};

export type GoalAi = { available: boolean; plan: 'FREE'; limitPerDay: number; remainingToday: number };
export type GoalState = { goal: Goal | null; ai: GoalAi };

export type GoalInput = {
  category: GoalCategory;
  name: string;
  amount: number;
  dueMonth: string;
  currentAmount: number | null;
  monthlyPace: number | null;
};

const KEY = ['me', 'goal'];

export const useGoal = (enabled: boolean) =>
  useQuery({ queryKey: KEY, queryFn: () => api<GoalState>('/me/goal'), enabled, retry: false });

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalInput) => api<GoalState>('/me/goal', { method: 'PUT', json: input }),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/me/goal', { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData<GoalState>(KEY, (prev) => (prev ? { ...prev, goal: null } : prev)),
  });
}

export function useMakeCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ coach: Coach; ai: GoalAi }>('/me/goal/coach', { method: 'POST' }),
    onSuccess: ({ coach, ai }) =>
      qc.setQueryData<GoalState>(KEY, (prev) => (prev?.goal ? { goal: { ...prev.goal, coach }, ai } : prev)),
    onError: (e) => {
      // 409 GOAL_CHANGED(호출 중 목표가 바뀜)·404(지워짐)·429(횟수 소진)는 남은 횟수·목표를 다시 읽는다
      if (e instanceof ApiError && [404, 409, 429].includes(e.status)) void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** 'YYYY-MM' → '2027년 10월' */
export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${y}년 ${m}월`;
};

/** 화면 입력 기본값용: Asia/Seoul 기준 n달 뒤의 'YYYY-MM'. 계산 결과가 아니라 입력 칸 초깃값·최솟값에만 쓴다 */
export function monthFromNow(n: number) {
  const [y, m] = todayKst().split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}
