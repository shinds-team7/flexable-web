/**
 * 앱 전역 상태 (Mock, 메모리 저장 — 새로고침하면 초기화).
 * 시연 전용. 실제 서비스의 상태는 src/service/Session.tsx와 서버 API에 있다.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { DEFAULT_INSIGHTS, DEFAULT_MEMORY, type Insight, type MemoryItem } from '@/demo/ai/memory';
import {
  buildTransactions,
  DEFAULT_FIXED,
  DEFAULT_INCOME,
  DEFAULT_PROTECTED,
  OPENING_BALANCE,
  type FixedExpense,
  type Protected,
  type Transaction,
} from '@/demo/data/mock';
import { addDays, diffDays, endOfWeek, startOfDay, startOfWeek, toKey } from '@/utils/date';
import { computeBudget, type BudgetInput, type BudgetSummary, type LargePlan, type ScheduledSpend } from './budget';

type Income = { amount: number; payday: number };
export type HomeStyle = 'classic' | 'character';
export type NotifySettings = { morning: boolean; hour: number; minute: number; payment: boolean; plan: boolean; weekly: boolean };

type Store = {
  today: Date;
  onboarded: boolean;
  completeOnboarding: () => void;
  restartOnboarding: () => void;

  income: Income;
  setIncome: (i: Income) => void;
  fixed: FixedExpense[];
  setFixed: (f: FixedExpense[]) => void;
  protectedList: Protected[];
  setProtected: (p: Protected[]) => void;

  transactions: Transaction[];
  /** 거래 수정 — 반영 제외, 1/N, 카테고리 */
  updateTx: (id: string, patch: Partial<Pick<Transaction, 'excluded' | 'splitN' | 'memo' | 'category'>>) => void;
  /** 새 결제 수신 (시연: /m/simulations/pay) — 서버가 카드/오픈뱅킹 알림을 받아 넣어주는 부분 */
  addTransaction: (t: Omit<Transaction, 'id' | 'status'> & { id?: string }) => void;

  /** 홈 화면 스타일 — 기본(/m) 또는 캐릭터(/m/home2) */
  homeStyle: HomeStyle;
  setHomeStyle: (h: HomeStyle) => void;

  notify: NotifySettings;
  setNotify: (n: NotifySettings) => void;

  scheduled: ScheduledSpend[];
  addScheduled: (s: Omit<ScheduledSpend, 'id' | 'status'>) => string;
  updateScheduled: (id: string, patch: Partial<ScheduledSpend>) => void;
  removeScheduled: (id: string) => void;
  /** 삭제 되돌리기 — 같은 id로 복원 */
  restoreScheduled: (s: ScheduledSpend) => void;
  settleScheduled: (id: string, actual: number, transactionIds?: string[]) => { memoryLabel?: string; before?: number; after?: number };

  plans: LargePlan[];
  addPlan: (p: Omit<LargePlan, 'id'>) => void;
  removePlan: (id: string) => void;

  memory: MemoryItem[];
  updateMemory: (id: string, amount: number) => void;
  insights: Insight[];
  removeInsight: (id: string) => void;
  restoreInsight: (i: Insight) => void;

  budgetInput: BudgetInput;
  summary: BudgetSummary;
};

const Ctx = createContext<Store | null>(null);

let seq = 100;
const nextId = (p: string) => `${p}-${++seq}`;

/** 시연 전용 저장 키 — 실제 서비스 저장소와 섞이지 않도록 demo namespace를 쓴다. */
const ONBOARD_KEY = 'flexable:demo:onboarded';
const HOME_KEY = 'flexable:demo:homeStyle';
/** /m 분리 전 키(flexable:onboarded, flexable:homeStyle) → 시연 키로 1회 이행 */
const LEGACY_KEYS: [string, string][] = [
  ['flexable:onboarded', ONBOARD_KEY],
  ['flexable:homeStyle', HOME_KEY],
];
function migrateLegacyKeys() {
  if (Platform.OS !== 'web') return;
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    for (const [from, to] of LEGACY_KEYS) {
      const v = ls.getItem(from);
      if (v === null) continue;
      if (ls.getItem(to) === null) ls.setItem(to, v);
      ls.removeItem(from);
    }
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}
function readHomeStyle(): HomeStyle {
  if (Platform.OS !== 'web') return 'classic';
  try {
    return globalThis.localStorage?.getItem(HOME_KEY) === 'character' ? 'character' : 'classic';
  } catch {
    return 'classic';
  }
}
function writeHomeStyle(v: HomeStyle) {
  if (Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.setItem(HOME_KEY, v);
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}
function readOnboarded(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return globalThis.localStorage?.getItem(ONBOARD_KEY) === '1';
  } catch {
    return false;
  }
}
function writeOnboarded(v: boolean) {
  if (Platform.OS !== 'web') return;
  try {
    if (v) globalThis.localStorage?.setItem(ONBOARD_KEY, '1');
    else globalThis.localStorage?.removeItem(ONBOARD_KEY);
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

function initialScheduled(today: Date): ScheduledSpend[] {
  const weekEnd = endOfWeek(today);
  const left = diffDays(weekEnd, today);
  const k = (d: Date) => toKey(d);
  return [
    {
      id: 's0',
      title: '동기 생일 선물',
      date: k(addDays(today, -1)),
      amount: 30000,
      items: [{ label: '생일·선물', amount: 30000, basis: '최근 6개월 생일·선물 3회 평균', memoryId: 'm6' }],
      source: 'ai',
      status: 'planned',
    },
    {
      id: 's1',
      title: '스터디 (카페)',
      date: k(today),
      amount: 6200,
      items: [{ label: '카페', amount: 6200, basis: '최근 6개월 카페 37회 평균', memoryId: 'm4' }],
      source: 'calendar',
      status: 'planned',
    },
    {
      id: 's2',
      title: '동기 저녁 모임',
      date: k(addDays(today, Math.min(1, left))),
      amount: 18500,
      items: [{ label: '저녁 외식', amount: 18500, basis: '최근 6개월 저녁 외식 14회 평균', memoryId: 'm2' }],
      source: 'ai',
      status: 'planned',
    },
    {
      id: 's3',
      title: '주말 영화',
      date: k(weekEnd),
      amount: 15000,
      items: [{ label: '영화', amount: 15000, basis: '최근 6개월 영화 4회 평균', memoryId: 'm5' }],
      source: 'ai',
      status: 'planned',
    },
  ];
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [today] = useState(() => startOfDay(new Date()));
  const [onboarded, setOnboarded] = useState(() => {
    migrateLegacyKeys();
    return readOnboarded();
  });
  const [income, setIncome] = useState<Income>({ amount: DEFAULT_INCOME.amount, payday: DEFAULT_INCOME.payday });
  const [fixed, setFixed] = useState<FixedExpense[]>(DEFAULT_FIXED);
  const [protectedList, setProtected] = useState<Protected[]>(DEFAULT_PROTECTED);
  const [transactions, setTransactions] = useState(() =>
    buildTransactions(today, DEFAULT_INCOME.payday, DEFAULT_INCOME.amount, DEFAULT_FIXED),
  );
  const [scheduled, setScheduled] = useState<ScheduledSpend[]>(() => initialScheduled(today));
  const [plans, setPlans] = useState<LargePlan[]>(() => [
    { id: 'p1', title: '연말 콘서트 티켓', amount: 165000, weekStart: toKey(addDays(startOfWeek(today), 7 * 6)) },
  ]);
  const [memory, setMemory] = useState<MemoryItem[]>(DEFAULT_MEMORY);
  const [homeStyle, setHomeStyleState] = useState<HomeStyle>(readHomeStyle);
  const [notify, setNotify] = useState<NotifySettings>({ morning: true, hour: 8, minute: 0, payment: true, plan: true, weekly: false });
  const [insights, setInsights] = useState<Insight[]>(DEFAULT_INSIGHTS);

  const value = useMemo<Store>(() => {
    const budgetInput: BudgetInput = {
      today,
      transactions,
      scheduled,
      plans,
      income,
      fixed,
      protectedList,
      openingBalance: OPENING_BALANCE,
    };
    const sortByDate = (a: ScheduledSpend, b: ScheduledSpend) => (a.date < b.date ? -1 : 1);

    return {
      today,
      onboarded,
      completeOnboarding: () => {
        writeOnboarded(true);
        setOnboarded(true);
      },
      restartOnboarding: () => {
        writeOnboarded(false);
        setOnboarded(false);
      },
      income,
      setIncome,
      fixed,
      setFixed,
      protectedList,
      setProtected,
      transactions,
      updateTx: (id, patch) => setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),
      addTransaction: (t) =>
        setTransactions((prev) => {
          const id = t.id ?? nextId('tx');
          if (prev.some((x) => x.id === id)) return prev; // 같은 결제 중복 수신 방지
          return [{ ...t, id, status: 'confirmed' as const }, ...prev];
        }),
      homeStyle,
      setHomeStyle: (h) => {
        writeHomeStyle(h);
        setHomeStyleState(h);
      },
      notify,
      setNotify,
      scheduled,
      addScheduled: (s) => {
        const id = nextId('s');
        setScheduled((prev) => [...prev, { ...s, id, status: 'planned' as const }].sort(sortByDate));
        return id;
      },
      updateScheduled: (id, patch) =>
        setScheduled((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)).sort(sortByDate)),
      removeScheduled: (id) => setScheduled((prev) => prev.filter((s) => s.id !== id)),
      restoreScheduled: (item) =>
        setScheduled((prev) => (prev.some((x) => x.id === item.id) ? prev : [...prev, item].sort(sortByDate))),
      settleScheduled: (id, actual, transactionIds = []) => {
        const target = scheduled.find((s) => s.id === id);
        if (!target || target.status === 'settled') return {};
        setScheduled((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'settled', actual } : s)));
        if (transactionIds.length) {
          const selectedIds = new Set(transactionIds);
          setTransactions((prev) =>
            prev.map((transaction) =>
              selectedIds.has(transaction.id) && (!transaction.planId || transaction.planId === id)
                ? { ...transaction, planId: id }
                : transaction,
            ),
          );
        }
        // 단일 항목 일정이면 AI 메모리 평균을 실제 금액으로 갱신 (학습)
        const memId = target?.items?.length === 1 ? target.items[0].memoryId : undefined;
        const mem = memory.find((m) => m.id === memId);
        if (!mem) return {};
        const after = Math.round((mem.amount * mem.count + actual) / (mem.count + 1) / 100) * 100;
        setMemory((prev) => prev.map((m) => (m.id === mem.id ? { ...m, amount: after, count: m.count + 1 } : m)));
        return { memoryLabel: mem.label, before: mem.amount, after };
      },
      plans,
      addPlan: (p) => setPlans((prev) => [...prev, { ...p, id: nextId('p') }].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))),
      removePlan: (id) => setPlans((prev) => prev.filter((p) => p.id !== id)),
      memory,
      updateMemory: (id, amount) =>
        setMemory((prev) => prev.map((m) => (m.id === id ? { ...m, amount, editedByUser: true } : m))),
      insights,
      removeInsight: (id) => setInsights((prev) => prev.filter((i) => i.id !== id)),
      restoreInsight: (item) => setInsights((prev) => (prev.some((x) => x.id === item.id) ? prev : [...prev, item])),
      budgetInput,
      summary: computeBudget(budgetInput),
    };
  }, [today, onboarded, income, fixed, protectedList, transactions, scheduled, plans, memory, insights, notify, homeStyle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within AppStoreProvider');
  return v;
}
