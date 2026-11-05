/**
 * 시연용 목 서버의 처음 데이터. 브라우저 메모리에만 있고 새로고침하면 다시 만든다(외부로 보내지 않음).
 * 거래는 시연 온보딩과 같은 생성기(demo/data/mock.ts buildTransactions)로 만들어 온보딩 숫자와 이어지게 한다.
 */
import type {
  Category,
  CoinLedgerEntry,
  ScheduledExpense,
  Transaction,
} from '@/real/service/types';
import { buildTransactions, type FixedExpense } from '@/demo/data/mock';
import type { CategoryId } from '@/demo/data/categories';
import { addDays, DAY, fixedDates, isoAt, kstDate, startOfDay } from './calc';

/** 시연 온보딩에서 넘겨받는 값 */
export type DemoSeed = {
  balance: number;
  cardUnpaid: number;
  payday: number;
  incomeAmount: number;
  fixed: { name: string; amount: number; day: number }[];
  protectedItems: { name: string; amount: number }[];
};

export type Settings = {
  balance: number;
  balanceAt: string;
  payday: number;
  incomeAmount: number;
  cardUnpaid: number;
  fixedExpenses: { id: number; name: string; amount: number; day: number }[];
  protectedItems: { id: number; name: string; amount: number }[];
  seedBase: number;
  updatedAt: string;
};
export type SeedRow = { date: string; choice: 'GOAL' | 'ALL' | 'MANUAL' | 'EXTRA'; amount: number; createdAt: string };
export type OutfitDef = { id: string; name: string; price: number | null; unlockLevel: number | null };

/** 실제 서버 기본 카테고리(CategoryService.DEFAULTS)와 같은 이름·색·아이콘·순서 */
const PRESETS: [string, 'EXPENSE' | 'INCOME', string, string][] = [
  ['식비', 'EXPENSE', '#12B76A', 'restaurant'],
  ['카페·간식', 'EXPENSE', '#F79009', 'cafe'],
  ['쇼핑', 'EXPENSE', '#7A5AF8', 'bag-handle'],
  ['교통', 'EXPENSE', '#2E90FA', 'bus'],
  ['문화·여가', 'EXPENSE', '#EE46BC', 'film'],
  ['생활·마트', 'EXPENSE', '#15B79E', 'cart'],
  ['고정지출', 'EXPENSE', '#667085', 'repeat'],
  ['기타', 'EXPENSE', '#98A2B3', 'ellipsis-horizontal'],
  ['급여', 'INCOME', '#2E90FA', 'cash'],
  ['용돈', 'INCOME', '#12B76A', 'gift'],
  ['기타 수입', 'INCOME', '#98A2B3', 'add-circle'],
];

/** 실제 서버의 활성 코스튬(V8~V13 마이그레이션 결과). 레벨 코스튬 먼저, 상점 상품 뒤 */
export const OUTFITS: OutfitDef[] = [
  { id: 'costume-lv1', name: '광부', price: null, unlockLevel: 1 },
  { id: 'outfit-02', name: '직장냥이', price: null, unlockLevel: 2 },
  { id: 'outfit-01', name: '잭팟', price: null, unlockLevel: 3 },
  { id: 'outfit-03', name: '선비냥이', price: 200, unlockLevel: null },
  { id: 'outfit-04', name: '유령냥이', price: 200, unlockLevel: null },
  { id: 'outfit-05', name: '고양마녀', price: 200, unlockLevel: null },
  { id: 'outfit-07', name: '달밤 낚시 고양이', price: 200, unlockLevel: null },
  { id: 'outfit-08', name: '산타냥이', price: 200, unlockLevel: null },
];

/** 시연 기본 코인 — 코인 코스튬을 모두 사고도 남는다 */
export const START_COINS = 1518;
export const REFERRAL_CODE = 'FLEXDEMO';
export const REFERRAL_REWARD = 100;

const CATEGORY_OF: Partial<Record<CategoryId, string>> = {
  food: '식비',
  cafe: '카페·간식',
  shopping: '쇼핑',
  transport: '교통',
  culture: '문화·여가',
  living: '생활·마트',
  etc: '기타',
  transfer: '기타',
  income: '급여',
};
const MEMOS: Record<string, string> = {
  nbbang: '4명 회식 · 1/N로 받기로 함',
  proxy: '동아리 비품, 나중에 돌려받아요',
  gift: '민지 생일 선물',
};

export function buildCategories(): Category[] {
  return PRESETS.map(([name, type, color, icon], i) => ({ id: i + 1, name, type, color, icon, isDefault: true }));
}

/** 지난 두 정산 주기 + 그 앞 한 주기(약 3개월) 예시 거래와 고정지출 자동 기록 */
export function buildTransactionsFor(seed: DemoSeed, categories: Category[], now: number): Transaction[] {
  const byName = (name: string) => categories.find((c) => c.name === name)!;
  const fixedDemo: FixedExpense[] = seed.fixed.map((f, i) => ({ id: `f${i}`, ...f }));
  const local = new Date(now);
  const recent = buildTransactions(local, seed.payday, seed.incomeAmount, fixedDemo);
  const earliest = recent.reduce((a, t) => (t.date < a ? t.date : a), kstDate(now));
  // 더 앞 주기: 오늘을 두 달 당긴 날 기준으로 만든 내역에서 겹치지 않는 날짜만 쓴다(시나리오 거래 제외).
  const older = buildTransactions(new Date(now - 62 * DAY), seed.payday, seed.incomeAmount, fixedDemo).filter(
    (t) => /^\d{4}-\d{2}-\d{2}-/.test(t.id) && t.date < earliest,
  );
  let id = 1000;
  const out: Transaction[] = [];
  for (const t of [...older, ...recent]) {
    const name = CATEGORY_OF[t.category];
    if (!name) continue; // 고정지출(아래에서 설정 기준으로 기록)·내 계좌 이동은 넣지 않는다
    const c = byName(name);
    const occurredAt = isoAt(Date.parse(`${t.date}T${t.time}:00+09:00`));
    if (Date.parse(occurredAt) > now) continue;
    out.push({
      id: ++id,
      type: t.amount > 0 ? 'INCOME' : 'EXPENSE',
      amount: Math.abs(t.amount),
      categoryId: c.id,
      category: { id: c.id, name: c.name, color: c.color, icon: c.icon },
      title: t.category === 'income' ? '급여' : t.merchant,
      memo: MEMOS[t.id] ?? null,
      occurredAt,
      createdAt: occurredAt,
      fromFixed: false,
    });
  }
  // 용돈 수입 한 건
  const allowance = byName('용돈');
  const allowanceAt = isoAt(startOfDay(addDays(kstDate(now), -19)) + 18 * 3600000);
  out.push({
    id: ++id,
    type: 'INCOME',
    amount: 100000,
    categoryId: allowance.id,
    category: { id: allowance.id, name: allowance.name, color: allowance.color, icon: allowance.icon },
    title: '부모님 용돈',
    memo: null,
    occurredAt: allowanceAt,
    createdAt: allowanceAt,
    fromFixed: false,
  });
  // 고정지출 자동 기록(fromFixed)
  const fixedCat = byName('고정지출');
  const from = out.reduce((a, t) => (kstDateOf(t.occurredAt) < a ? kstDateOf(t.occurredAt) : a), kstDate(now));
  for (const f of seed.fixed) {
    for (const d of fixedDates(f.day, from, kstDate(now))) {
      const at = isoAt(startOfDay(d) + 9 * 3600000);
      if (Date.parse(at) > now) continue;
      out.push({
        id: ++id,
        type: 'EXPENSE',
        amount: f.amount,
        categoryId: fixedCat.id,
        category: { id: fixedCat.id, name: fixedCat.name, color: fixedCat.color, icon: fixedCat.icon },
        title: f.name,
        memo: null,
        occurredAt: at,
        createdAt: at,
        fromFixed: true,
      });
    }
  }
  return out;
}
const kstDateOf = (iso: string) => kstDate(Date.parse(iso));

export function buildScheduled(categories: Category[], now: number): ScheduledExpense[] {
  const today = kstDate(now);
  const by = (name: string) => categories.find((c) => c.name === name)!;
  const rows: [number, string, number, string][] = [
    [2, '친구 생일 선물', 35000, '쇼핑'],
    [5, '팀 프로젝트 회식', 40000, '식비'],
    [9, '콘서트 티켓', 99000, '문화·여가'],
  ];
  const created = isoAt(now - 3 * DAY);
  return rows.map(([offset, title, amount, cat], i) => {
    const c = by(cat);
    return {
      id: 500 + i,
      amount,
      categoryId: c.id,
      category: { id: c.id, name: c.name, color: c.color, icon: c.icon },
      title,
      date: addDays(today, offset),
      createdAt: created,
      updatedAt: created,
    };
  });
}

/**
 * 코인 적립 내역(오래된 순). 합이 START_COINS(1,518)가 되게 만든다.
 * 가입 선물 200 + 친구 초대 100×2 + 출석 4일(5·5·55·5) + 예산 보너스 5×12 + 시간 적립 988
 */
export function buildLedger(now: number): CoinLedgerEntry[] {
  const today = kstDate(now);
  const rows: Omit<CoinLedgerEntry, 'id'>[] = [];
  const at = (offset: number, hour: number) => isoAt(startOfDay(addDays(today, offset)) + hour * 3600000);
  rows.push({ reason: 'SIGNUP_GIFT', amount: 200, refDate: null, outfitId: null, createdAt: at(-99, 9) });
  for (let d = -98; d <= -1; d++)
    rows.push({ reason: 'PASSIVE', amount: 10, refDate: null, outfitId: null, createdAt: at(d, 21) });
  rows.push({ reason: 'REFERRAL_INVITER', amount: 100, refDate: null, outfitId: null, createdAt: at(-31, 20) });
  rows.push({ reason: 'REFERRAL_INVITER', amount: 100, refDate: null, outfitId: null, createdAt: at(-12, 13) });
  [5, 5, 55, 5].forEach((amount, i) =>
    rows.push({ reason: 'ATTENDANCE', amount, refDate: null, outfitId: null, createdAt: at(-4 + i, 8) }),
  );
  // 어제까지 예산을 지킨 보너스. 마지막(오늘 아침 지급, 어제 몫)은 홈에 처음 들어올 때 출석 모달로 보여 준다
  for (let d = 11; d >= 0; d--) {
    const day = addDays(today, -d - 1);
    const createdAt = isoAt(Math.min(now - 120000, Date.parse(at(-d, 7))));
    rows.push({ reason: 'BUDGET_BONUS', amount: 5, refDate: day, outfitId: null, createdAt });
  }
  // 오늘 이미 모은 시간 적립 8개(하루 최대 10개)
  rows.push({ reason: 'PASSIVE', amount: 8, refDate: null, outfitId: null, createdAt: isoAt(Math.min(now - 60000, startOfDay(today) + 8 * 3600000)) });
  rows.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return rows.map((r, i) => ({ ...r, id: i + 1 }));
}

export function buildSeedRows(protectedTotal: number, cycleEnds: string[], now: number): SeedRow[] {
  const rows: SeedRow[] = cycleEnds.map((end) => ({
    date: end,
    choice: 'GOAL',
    amount: protectedTotal,
    createdAt: isoAt(startOfDay(end) + 21 * 3600000),
  }));
  rows.push({ date: kstDate(now - 9 * DAY), choice: 'EXTRA', amount: 50000, createdAt: isoAt(now - 9 * DAY) });
  return rows.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
