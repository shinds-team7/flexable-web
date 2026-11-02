/**
 * 시연용 목 서버 — 실제 앱 화면(src/real)이 부르는 /api/v1 경로를 브라우저 메모리에서 처리한다.
 * 응답 모양은 실제 앱 계약(flexable-app docs/contracts/app-api.yaml → src/real/service/api/schema.d.ts)을 따른다.
 * 네트워크로 아무것도 보내지 않고, 새로고침하면 처음 예시 데이터로 돌아간다.
 */
import type {
  Category,
  CoinLedgerEntry,
  CoinReward,
  DayPreset,
  ScheduledExpense,
  Transaction,
  User,
} from '@/real/service/types';
import {
  addDays,
  attendanceReward,
  compute,
  DAY,
  daysBetween,
  EVEN,
  fromRecords,
  isoAt,
  kstDate,
  kstDateOf,
  MIN_DAYS,
  MIN_WEEKDAYS,
  nextPayday,
  previousPayday,
  W_MAX,
  W_MIN,
  WEEKDAY,
  WEEKEND,
} from './calc';
import {
  buildCategories,
  buildLedger,
  buildScheduled,
  buildSeedRows,
  buildTransactionsFor,
  OUTFITS,
  REFERRAL_CODE,
  REFERRAL_REWARD,
  type DemoSeed,
  type SeedRow,
  type Settings,
} from './data';
import { chatReply } from './chat';

export type { DemoSeed } from './data';

type Fail = { code: string; message: string; fields?: Record<string, string> };
export class MockFailure extends Error {
  constructor(public fail: Fail) {
    super(fail.message);
  }
}
const fail = (code: string, message: string, fields?: Record<string, string>): never => {
  throw new MockFailure({ code, message, fields });
};
const invalid = (field: string, message: string) => fail('VALIDATION_FAILED', message, { [field]: message });

type State = {
  user: User;
  settings: Settings;
  categories: Category[];
  transactions: Transaction[];
  keys: Map<string, number>;
  scheduled: ScheduledExpense[];
  seedRows: SeedRow[];
  preset: DayPreset;
  custom: number[];
  ledger: CoinLedgerEntry[];
  acked: Set<number>;
  passive: { collectable: number; collectedToday: number };
  attendance: { total: number; checkedToday: boolean };
  owned: Set<string>;
  equipped: string | null;
  referral: { invitedCount: number; registered: boolean };
  webLinks: { id: number; createdAt: string }[];
  seq: number;
};

let state: State | null = null;
/** 시연 온보딩에서 받은 값. 메모리에만 두고 새로고침하면 기본 예시값으로 돌아간다(브라우저 저장소에 쓰지 않음). */
let seedInput: DemoSeed | null = null;

/** 기본값(시연 온보딩을 건너뛴 경우) — 시연 온보딩 기본값과 같은 수입·고정지출·저축 */
const FALLBACK: DemoSeed = {
  balance: 1650000,
  cardUnpaid: 320000,
  payday: 25,
  incomeAmount: 2300000,
  fixed: [
    { name: '청년도약계좌 자동이체', amount: 400000, day: 1 },
    { name: '월세', amount: 450000, day: 5 },
    { name: '넷플릭스', amount: 13500, day: 10 },
    { name: '휴대폰 요금', amount: 59000, day: 15 },
    { name: '유튜브 프리미엄', amount: 14900, day: 17 },
    { name: '실손보험', amount: 32000, day: 20 },
  ],
  protectedItems: [
    { name: '비상금', amount: 500000 },
    { name: '이번 달 추가 저축', amount: 300000 },
  ],
};

function create(seed: DemoSeed): State {
  const now = Date.now();
  const today = kstDate(now);
  const categories = buildCategories();
  const transactions = buildTransactionsFor(seed, categories, now);
  const protectedTotal = seed.protectedItems.reduce((a, p) => a + p.amount, 0);
  const end1 = addDays(previousPayday(today, seed.payday), -1);
  // 직전 두 주기는 이미 시드머니로 반영한 상태(수입일 전날에는 오늘 끝나는 주기가 반영 대기로 뜬다)
  const ends = [end1, addDays(previousPayday(addDays(end1, -1), seed.payday), -1)];
  const balanceAt = isoAt(now);
  return {
    user: {
      id: 1,
      email: 'demo@flexable.app',
      onboarded: true,
      createdAt: isoAt(now - 60 * DAY),
      provider: 'email',
      hasPassword: true,
    },
    settings: {
      balance: seed.balance,
      balanceAt,
      payday: seed.payday,
      incomeAmount: seed.incomeAmount,
      cardUnpaid: seed.cardUnpaid,
      fixedExpenses: seed.fixed.map((f, i) => ({ id: 100 + i, ...f })),
      protectedItems: seed.protectedItems.map((p, i) => ({ id: 200 + i, ...p })),
      seedBase: 1200000,
      updatedAt: balanceAt,
    },
    categories,
    transactions,
    keys: new Map(),
    scheduled: buildScheduled(categories, now),
    seedRows: buildSeedRows(protectedTotal, ends, now),
    preset: 'EVEN',
    custom: EVEN,
    ledger: buildLedger(now),
    acked: new Set(),
    passive: { collectable: 2, collectedToday: 8 },
    attendance: { total: 4, checkedToday: false },
    owned: new Set(['costume-lv1']),
    equipped: null,
    referral: { invitedCount: 2, registered: false },
    webLinks: [{ id: 1, createdAt: isoAt(now - 5 * DAY) }],
    seq: 5000,
  };
}
function db(): State {
  if (!state) {
    state = create(seedInput ?? FALLBACK);
    // 처음 데이터의 보상은 마지막 예산 보너스만 '아직 안 보여 줌'으로 둔다
    const bonus = [...state.ledger].reverse().find((e) => e.reason === 'BUDGET_BONUS');
    state.ledger.forEach((e) => e !== bonus && state!.acked.add(e.id));
  }
  return state;
}

/** 시연 온보딩을 마칠 때 그 값으로 예시 데이터를 새로 만든다. null이면 지운다(처음부터 다시 보기). */
export function seedDemoServer(seed: DemoSeed | null) {
  seedInput = seed;
  state = null;
}

// ───────────── 계산 ─────────────
const today = () => kstDate();
const protectedTotal = (s: State) => s.settings.protectedItems.reduce((a, p) => a + p.amount, 0);
const weights = (s: State): number[] =>
  s.preset === 'EVEN'
    ? EVEN
    : s.preset === 'WEEKEND'
      ? WEEKEND
      : s.preset === 'WEEKDAY'
        ? WEEKDAY
        : s.preset === 'RECORD'
          ? (record(s).weights ?? EVEN)
          : s.custom;
function spentByDay(s: State) {
  const m = new Map<string, number>();
  for (const t of s.transactions)
    if (t.type === 'EXPENSE' && !t.fromFixed) {
      const d = kstDateOf(t.occurredAt);
      m.set(d, (m.get(d) ?? 0) + t.amount);
    }
  return m;
}
const record = (s: State) => fromRecords(spentByDay(s), today());
const savedSince = (s: State, since: string) =>
  s.seedRows.filter((r) => Date.parse(r.createdAt) > Date.parse(since)).reduce((a, r) => a + r.amount, 0);
function calc(s: State, date: string, goal = protectedTotal(s)) {
  return compute(
    {
      balance: s.settings.balance,
      balanceAt: s.settings.balanceAt,
      payday: s.settings.payday,
      cardUnpaid: s.settings.cardUnpaid,
      fixed: s.settings.fixedExpenses,
      protectedTotal: goal,
      transactions: s.transactions.map((t) => ({
        type: t.type,
        amount: t.amount,
        occurredAt: t.occurredAt,
        fixed: t.fromFixed,
      })),
      savedSinceBalance: savedSince(s, s.settings.balanceAt),
      weights: weights(s),
    },
    date,
  );
}
/** 캐릭터 점수 — 시연은 Lv.1 85점(어제 지켜서 +15)에서 시작한다 */
const POINTS = 85;
function todayView(s: State) {
  return {
    ...calc(s, today()),
    hasTransactions: s.transactions.length > 0,
    dayPreset: s.preset,
    characterPoints: POINTS,
    characterDelta: 15,
  };
}
/** 지금까지 도달한 최고 캐릭터 단계(1~3) */
const peakLevel = () => Math.min(3, Math.floor(Math.min(POINTS, 200) / 100) + 1);

function seedView(s: State) {
  const t = today();
  const next = nextPayday(t, s.settings.payday);
  const end = t === addDays(next, -1) ? t : addDays(previousPayday(t, s.settings.payday), -1);
  const goal = protectedTotal(s);
  const saved = s.seedRows.reduce((a, r) => a + r.amount, 0);
  const done = s.seedRows.some((r) => r.choice !== 'EXTRA' && r.date === end);
  return {
    base: s.settings.seedBase,
    saved,
    total: s.settings.seedBase + saved,
    monthlyGoal: goal,
    movable: Math.max(0, calc(s, t).remaining),
    pending: done
      ? null
      : { cycleEnd: end, payday: addDays(end, 1), goalAmount: goal, allAmount: Math.max(0, calc(s, end, goal).remaining + goal) },
    entries: [...s.seedRows]
      .reverse()
      .slice(0, 12)
      .map((r) => ({ cycleEnd: r.date, choice: r.choice, amount: r.amount, createdAt: r.createdAt })),
  };
}

function dayWeightsView(s: State) {
  const r = record(s);
  return {
    preset: s.preset,
    weights: weights(s),
    min: W_MIN,
    max: W_MAX,
    presets: [
      { id: 'EVEN' as const, weights: EVEN },
      { id: 'RECORD' as const, weights: r.weights },
      { id: 'WEEKEND' as const, weights: WEEKEND },
      { id: 'WEEKDAY' as const, weights: WEEKDAY },
    ],
    record: { from: r.from, to: r.to, days: r.days, weekdays: r.weekdays, minDays: MIN_DAYS, minWeekdays: MIN_WEEKDAYS },
  };
}

function settingsView(s: State) {
  return { ...s.settings };
}

// ───────────── 코인·코스튬 ─────────────
const balance = (s: State) => s.ledger.reduce((a, e) => a + e.amount, 0);
function nextPassiveAt(s: State) {
  if (s.passive.collectedToday + s.passive.collectable >= 10) return null;
  const hour = 3600000;
  return isoAt(Math.ceil(Date.now() / hour) * hour);
}
function wallet(s: State) {
  return {
    balance: balance(s),
    passive: {
      collectable: s.passive.collectable,
      collectedToday: s.passive.collectedToday,
      dailyLimit: 10,
      nextAt: nextPassiveAt(s),
    },
    equippedOutfitId: s.equipped,
  };
}
function post(s: State, reason: CoinLedgerEntry['reason'], amount: number, outfitId: string | null = null) {
  const id = (s.ledger.at(-1)?.id ?? 0) + 1;
  s.ledger.push({ id, reason, amount, refDate: null, outfitId, createdAt: isoAt() });
  return id;
}
const ownedLevel = (s: State, o: (typeof OUTFITS)[number]) =>
  s.owned.has(o.id) || (o.unlockLevel !== null && o.unlockLevel <= peakLevel());
function outfitList(s: State) {
  const equipped = s.equipped ?? 'costume-lv1';
  return {
    balance: balance(s),
    equippedOutfitId: s.equipped,
    peakLevel: peakLevel(),
    items: OUTFITS.map((o) => ({
      id: o.id,
      name: o.name,
      price: o.price,
      unlockLevel: o.unlockLevel,
      owned: ownedLevel(s, o),
      equipped: o.id === equipped,
    })),
  };
}
function attendanceView(s: State) {
  const next = s.attendance.checkedToday ? s.attendance.total : s.attendance.total + 1;
  return {
    today: today(),
    total: s.attendance.total,
    checkedToday: s.attendance.checkedToday,
    todayReward: attendanceReward(next),
    todayOutfitId: null,
  };
}

// ───────────── 거래 ─────────────
function categoryRef(s: State, id: number) {
  const c = s.categories.find((x) => x.id === id);
  return c ? { id: c.id, name: c.name, color: c.color, icon: c.icon } : null;
}
type TxBody = {
  type?: 'EXPENSE' | 'INCOME';
  amount?: number;
  categoryId?: number;
  title?: string;
  memo?: string | null;
  occurredAt?: string;
};
function checkTx(s: State, b: Required<Pick<TxBody, 'type' | 'amount' | 'categoryId' | 'title'>>) {
  if (!Number.isSafeInteger(b.amount) || b.amount < 1) invalid('amount', '금액을 1원 이상 입력해 주세요');
  if (!b.title?.trim()) invalid('title', '내용을 입력해 주세요');
  const c = s.categories.find((x) => x.id === b.categoryId);
  if (!c || c.type !== b.type) invalid('categoryId', '카테고리를 다시 골라 주세요');
}
function inRange(iso: string, from: string, to: string) {
  const d = kstDateOf(iso);
  return d >= from && d <= to;
}
const byNewest = (a: Transaction, b: Transaction) =>
  Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id;

function analysis(s: State, from: string, to: string) {
  const txs = s.transactions.filter((t) => inRange(t.occurredAt, from, to));
  const daily = new Map<string, { date: string; expense: number; income: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) daily.set(d, { date: d, expense: 0, income: 0 });
  const per = new Map<number, { amount: number; count: number }>();
  let expenseTotal = 0;
  let incomeTotal = 0;
  let expenseCount = 0;
  for (const t of txs) {
    const day = daily.get(kstDateOf(t.occurredAt));
    if (t.type === 'EXPENSE') {
      expenseTotal += t.amount;
      expenseCount++;
      if (day) day.expense += t.amount;
      const p = per.get(t.categoryId) ?? { amount: 0, count: 0 };
      p.amount += t.amount;
      p.count++;
      per.set(t.categoryId, p);
    } else {
      incomeTotal += t.amount;
      if (day) day.income += t.amount;
    }
  }
  const byCategory = [...per.entries()]
    .map(([id, p]) => {
      const c = s.categories.find((x) => x.id === id);
      return {
        categoryId: id,
        name: c?.name ?? '기타',
        color: c?.color ?? '#98A2B3',
        icon: c?.icon ?? 'pricetag',
        amount: p.amount,
        count: p.count,
        ratio: expenseTotal ? Math.round((p.amount / expenseTotal) * 1000) / 1000 : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
  return { from, to, expenseTotal, incomeTotal, expenseCount, byCategory, daily: [...daily.values()] };
}

// ───────────── 라우터 ─────────────
type Req = { method: string; path: string; query: URLSearchParams; body: any; key?: string };
const id = (path: string, re: RegExp) => Number(path.match(re)?.[1]);

export function handle(method: string, url: string, body: unknown, key?: string): unknown {
  const s = db();
  const [path, qs = ''] = url.split('?');
  const r: Req = { method, path, query: new URLSearchParams(qs), body: body ?? {}, key };
  const route = `${method} ${path}`;
  const q = (name: string) => r.query.get(name) ?? '';

  // 계정
  if (route === 'GET /me') return s.user;
  if (route === 'DELETE /me') return undefined;
  if (route === 'POST /auth/logout') return undefined;
  if (route === 'POST /auth/login') {
    if (!r.body.password) fail('INVALID_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요');
    return { accessToken: 'demo', expiresAt: isoAt(Date.now() + DAY), user: s.user };
  }

  // 예산
  if (route === 'GET /budget/today') return todayView(s);
  if (route === 'GET /budget/settings') return settingsView(s);
  if (route === 'PUT /budget/settings') {
    const b = r.body;
    if (!Number.isInteger(b.payday) || b.payday < 1 || b.payday > 31) invalid('payday', '수입일은 1~31일로 입력해 주세요');
    const at = isoAt();
    s.settings = {
      balance: b.balance,
      balanceAt: b.balanceAt ?? at,
      payday: b.payday,
      incomeAmount: b.incomeAmount,
      cardUnpaid: b.cardUnpaid ?? 0,
      fixedExpenses: (b.fixedExpenses ?? []).map((f: any) => ({ id: ++s.seq, name: f.name, amount: f.amount, day: f.day })),
      protectedItems: (b.protectedItems ?? []).map((p: any) => ({ id: ++s.seq, name: p.name, amount: p.amount })),
      seedBase: b.seedBase ?? s.settings.seedBase,
      updatedAt: at,
    };
    s.user = { ...s.user, onboarded: true };
    return settingsView(s);
  }
  if (route === 'GET /budget/day-weights') return dayWeightsView(s);
  if (route === 'PUT /budget/day-weights') {
    const preset = r.body.preset as DayPreset;
    if (preset === 'RECORD' && !record(s).weights) invalid('preset', '내 기록 기준을 쓰려면 기록이 더 필요해요');
    if (preset === 'CUSTOM') {
      const w = r.body.weights as number[] | undefined;
      if (!w || w.length !== 7 || w.some((x) => !Number.isInteger(x) || x < W_MIN || x > W_MAX))
        invalid('weights', `요일 비중은 ${W_MIN}~${W_MAX}로 정해 주세요`);
      s.custom = w!;
    }
    s.preset = preset;
    return dayWeightsView(s);
  }
  if (route === 'GET /budget/seed-money') return seedView(s);
  if (route === 'POST /budget/seed-money/entries') {
    const v = seedView(s);
    if (!v.pending || v.pending.cycleEnd !== r.body.cycleEnd) fail('SEED_NOT_PENDING', '이미 반영했거나 반영할 주기가 아니에요');
    const p = v.pending!;
    const choice = r.body.choice as 'GOAL' | 'ALL' | 'MANUAL';
    const amount = choice === 'GOAL' ? p.goalAmount : choice === 'ALL' ? p.allAmount : Number(r.body.amount);
    if (!Number.isSafeInteger(amount) || amount < 0) invalid('amount', '금액을 입력해 주세요');
    s.seedRows.push({ date: p.cycleEnd, choice, amount, createdAt: isoAt() });
    return seedView(s);
  }
  if (route === 'POST /budget/seed-money/transfers') {
    const amount = Number(r.body.amount);
    const movable = seedView(s).movable;
    if (!Number.isSafeInteger(amount) || amount < 1) invalid('amount', '금액을 1원 이상 입력해 주세요');
    if (amount > movable)
      invalid('amount', `지금 보낼 수 있는 돈(${movable.toLocaleString('ko-KR')}원)보다 많이 보낼 수 없어요`);
    s.seedRows.push({ date: today(), choice: 'EXTRA', amount, createdAt: isoAt() });
    return seedView(s);
  }
  if (route === 'PUT /budget/seed-money/base') {
    const base = Number(r.body.base);
    if (!Number.isSafeInteger(base) || base < 0) invalid('base', '금액을 0원 이상 입력해 주세요');
    s.settings = { ...s.settings, seedBase: base, updatedAt: isoAt() };
    return seedView(s);
  }

  // 카테고리
  if (route === 'GET /categories') return s.categories.filter((c) => !q('type') || c.type === q('type'));
  if (route === 'POST /categories') {
    const name = String(r.body.name ?? '').trim();
    if (!name) invalid('name', '이름을 입력해 주세요');
    if (s.categories.some((c) => c.type === r.body.type && c.name === name))
      fail('CATEGORY_DUPLICATE', '같은 이름의 카테고리가 있어요');
    const c: Category = { id: ++s.seq, name, type: r.body.type, color: r.body.color, icon: r.body.icon, isDefault: false };
    s.categories.push(c);
    return c;
  }
  if (route === 'PUT /categories/order') {
    const ids: number[] = r.body.ids ?? [];
    const same = s.categories.filter((c) => c.type === r.body.type);
    if (ids.length !== same.length || same.some((c) => !ids.includes(c.id))) invalid('ids', '카테고리 목록을 다시 불러와 주세요');
    const other = s.categories.filter((c) => c.type !== r.body.type);
    const ordered = ids.map((x) => same.find((c) => c.id === x)!);
    s.categories = r.body.type === 'EXPENSE' ? [...ordered, ...other] : [...other, ...ordered];
    return ordered;
  }
  if (method === 'DELETE' && /^\/categories\/\d+$/.test(path)) {
    const c = s.categories.find((x) => x.id === id(path, /(\d+)$/));
    if (!c) return fail('NOT_FOUND', '카테고리를 찾지 못했어요');
    const fallbackName = c.type === 'EXPENSE' ? '기타' : '기타 수입';
    s.categories = s.categories.filter((x) => x.id !== c.id);
    let fallback = s.categories.find((x) => x.type === c.type && x.name === fallbackName);
    if (!fallback) {
      fallback = { id: ++s.seq, name: fallbackName, type: c.type, color: '#98A2B3', icon: 'pricetag', isDefault: false };
      s.categories.push(fallback);
    }
    const ref = categoryRef(s, fallback.id);
    s.transactions = s.transactions.map((t) => (t.categoryId === c.id ? { ...t, categoryId: fallback!.id, category: ref } : t));
    s.scheduled = s.scheduled.map((t) => (t.categoryId === c.id ? { ...t, categoryId: fallback!.id, category: ref } : t));
    return undefined;
  }

  // 지출 예정
  if (route === 'GET /scheduled-expenses')
    return {
      items: s.scheduled
        .filter((x) => x.date >= q('from') && x.date <= q('to'))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id)),
    };
  if ((route === 'POST /scheduled-expenses' || (method === 'PUT' && /^\/scheduled-expenses\/\d+$/.test(path)))) {
    const b = r.body;
    const existing = method === 'PUT' ? s.scheduled.find((x) => x.id === id(path, /(\d+)$/)) : undefined;
    if (method === 'PUT' && !existing) return fail('NOT_FOUND', '지출 예정을 찾지 못했어요');
    if (!Number.isSafeInteger(b.amount) || b.amount < 1) invalid('amount', '금액을 1원 이상 입력해 주세요');
    if (!String(b.title ?? '').trim()) invalid('title', '내용을 입력해 주세요');
    if (b.date <= today() && b.date !== existing?.date) invalid('date', '내일부터의 날짜를 선택해 주세요');
    const at = isoAt();
    const item: ScheduledExpense = {
      id: existing?.id ?? ++s.seq,
      amount: b.amount,
      categoryId: b.categoryId,
      category: categoryRef(s, b.categoryId),
      title: String(b.title).trim(),
      date: b.date,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    s.scheduled = existing ? s.scheduled.map((x) => (x.id === item.id ? item : x)) : [...s.scheduled, item];
    return item;
  }
  if (method === 'DELETE' && /^\/scheduled-expenses\/\d+$/.test(path)) {
    s.scheduled = s.scheduled.filter((x) => x.id !== id(path, /(\d+)$/));
    return undefined;
  }

  // 거래
  if (route === 'GET /transactions') {
    const from = q('from');
    const to = q('to');
    if (daysBetween(from, to) > 366) invalid('to', '366일 안으로 조회해 주세요');
    return {
      items: s.transactions
        .filter(
          (t) =>
            inRange(t.occurredAt, from, to) &&
            (!q('type') || t.type === q('type')) &&
            (!q('categoryId') || t.categoryId === Number(q('categoryId'))),
        )
        .sort(byNewest),
    };
  }
  if (route === 'POST /transactions') {
    if (r.key && s.keys.has(r.key)) return s.transactions.find((t) => t.id === s.keys.get(r.key!));
    const b = r.body as TxBody;
    checkTx(s, b as never);
    const at = isoAt();
    const t: Transaction = {
      id: ++s.seq,
      type: b.type!,
      amount: b.amount!,
      categoryId: b.categoryId!,
      category: categoryRef(s, b.categoryId!),
      title: b.title!.trim(),
      memo: b.memo?.trim() ? b.memo.trim() : null,
      occurredAt: b.occurredAt ? isoAt(Date.parse(b.occurredAt)) : at,
      createdAt: at,
      fromFixed: false,
    };
    s.transactions.push(t);
    if (r.key) s.keys.set(r.key, t.id);
    return t;
  }
  if (/^\/transactions\/\d+$/.test(path)) {
    const txId = id(path, /(\d+)$/);
    const t = s.transactions.find((x) => x.id === txId);
    if (!t) return fail('NOT_FOUND', '거래를 찾지 못했어요');
    if (method === 'GET') return t;
    if (method === 'DELETE') {
      s.transactions = s.transactions.filter((x) => x.id !== txId);
      return undefined;
    }
    if (method === 'PATCH') {
      const b = r.body as TxBody;
      const next: Transaction = {
        ...t,
        type: b.type ?? t.type,
        amount: b.amount ?? t.amount,
        categoryId: b.categoryId ?? t.categoryId,
        title: b.title?.trim() ?? t.title,
        memo: b.memo === undefined ? t.memo : b.memo?.trim() ? b.memo.trim() : null,
        occurredAt: b.occurredAt ? isoAt(Date.parse(b.occurredAt)) : t.occurredAt,
      };
      checkTx(s, next);
      next.category = categoryRef(s, next.categoryId);
      s.transactions = s.transactions.map((x) => (x.id === txId ? next : x));
      return next;
    }
  }
  if (route === 'GET /analysis/summary') return analysis(s, q('from'), q('to'));

  // 코인
  if (route === 'POST /coins/check-in') {
    const rewards: CoinReward[] = s.ledger
      .filter((e) => !s.acked.has(e.id) && e.amount > 0)
      .map((e) => ({ id: e.id, reason: e.reason, amount: e.amount, refDate: e.refDate, createdAt: e.createdAt }));
    return { wallet: wallet(s), rewards };
  }
  if (route === 'POST /coins/rewards/ack') {
    for (const x of (r.body.ids ?? []) as number[]) s.acked.add(x);
    return undefined;
  }
  if (route === 'GET /coins') return wallet(s);
  if (route === 'POST /coins/collect') {
    const collected = s.passive.collectable;
    if (collected > 0) {
      s.acked.add(post(s, 'PASSIVE', collected));
      s.passive = { collectable: 0, collectedToday: s.passive.collectedToday + collected };
    }
    return { collected, wallet: wallet(s) };
  }
  if (route === 'GET /coins/attendance') return attendanceView(s);
  if (route === 'POST /coins/attendance') {
    if (s.attendance.checkedToday) return { rewarded: 0, outfitId: null, attendance: attendanceView(s), wallet: wallet(s) };
    const reward = attendanceView(s).todayReward;
    s.acked.add(post(s, 'ATTENDANCE', reward));
    s.attendance = { total: s.attendance.total + 1, checkedToday: true };
    return { rewarded: reward, outfitId: null, attendance: attendanceView(s), wallet: wallet(s) };
  }
  if (route === 'GET /coins/ledger') {
    const before = r.query.get('before');
    const limit = Math.min(100, Number(r.query.get('limit') ?? 30) || 30);
    const list = [...s.ledger].reverse().filter((e) => before === null || e.id < Number(before));
    const items = list.slice(0, limit);
    return { items, nextBefore: list.length > limit ? items.at(-1)!.id : null };
  }

  // 코스튬
  if (route === 'GET /outfits') return outfitList(s);
  if (method === 'POST' && /^\/outfits\/[^/]+\/purchase$/.test(path)) {
    const o = OUTFITS.find((x) => x.id === decodeURIComponent(path.split('/')[2]));
    if (!o || o.price === null) return fail('OUTFIT_NOT_FOR_SALE', '상점에서 파는 코스튬이 아니에요');
    if (s.owned.has(o.id)) fail('OUTFIT_OWNED', '이미 가진 코스튬이에요');
    if (balance(s) < o.price) fail('COINS_NOT_ENOUGH', '코인이 모자라요');
    s.acked.add(post(s, 'PURCHASE', -o.price, o.id));
    s.owned.add(o.id);
    return outfitList(s);
  }
  // 시연 전용: 레벨 코스튬을 레벨과 상관없이 무료로 연다
  if (method === 'POST' && /^\/outfits\/[^/]+\/demo-unlock$/.test(path)) {
    const o = OUTFITS.find((x) => x.id === decodeURIComponent(path.split('/')[2]));
    if (!o || o.unlockLevel === null) return fail('NOT_FOUND', '레벨 코스튬을 찾지 못했어요');
    s.owned.add(o.id);
    return outfitList(s);
  }
  if (route === 'PUT /outfits/equipped') {
    const target = (r.body.outfitId ?? null) as string | null;
    const o = target === null ? null : OUTFITS.find((x) => x.id === target);
    if (target !== null && !o) invalid('outfitId', '코스튬을 찾지 못했어요');
    if (o && !ownedLevel(s, o)) fail('OUTFIT_LOCKED', '아직 열리지 않은 코스튬이에요');
    s.equipped = target === 'costume-lv1' ? null : target;
    return outfitList(s);
  }

  // 추천
  if (route === 'GET /referrals/me')
    return { code: REFERRAL_CODE, invitedCount: s.referral.invitedCount, registered: s.referral.registered, rewardAmount: REFERRAL_REWARD };
  if (route === 'POST /referrals') {
    const code = String(r.body.code ?? '').trim().toUpperCase();
    if (s.referral.registered) fail('REFERRAL_ALREADY', '이미 추천 코드를 등록했어요');
    if (!/^[A-Z0-9]{8}$/.test(code) || code === REFERRAL_CODE)
      fail('REFERRAL_CODE_INVALID', '추천 코드를 확인해 주세요. 시연에서는 영문·숫자 8자면 등록돼요');
    s.referral = { ...s.referral, registered: true };
    s.acked.add(post(s, 'REFERRAL_INVITEE', REFERRAL_REWARD));
    return { amount: REFERRAL_REWARD, wallet: wallet(s) };
  }

  // 웹 연동
  if (route === 'POST /me/web-link-codes') {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    return { code, expiresAt: isoAt(Date.now() + 10 * 60000) };
  }
  if (route === 'GET /me/web-links') return [...s.webLinks].reverse();
  if (method === 'DELETE' && /^\/me\/web-links\/\d+$/.test(path)) {
    const before = s.webLinks.length;
    s.webLinks = s.webLinks.filter((x) => x.id !== id(path, /(\d+)$/));
    if (before === s.webLinks.length) fail('LINK_NOT_FOUND', '연동을 찾지 못했어요');
    return undefined;
  }

  // AI 메이트(시연: 정해 둔 규칙으로 예시 답변)
  if (route === 'POST /chat/messages') {
    const t = todayView(s);
    const from = t.cycleStart;
    const to = today();
    const len = daysBetween(from, to);
    const prev = analysis(s, addDays(from, -len - 1), addDays(from, -1));
    return chatReply(r.body, {
      today: t,
      now: analysis(s, from, to),
      prev,
      recordReady: !!record(s).weights,
    });
  }

  return fail('NOT_FOUND', '시연에서 준비하지 않은 기능이에요');
}

/** 시연 웹 연동: 앱에서 받은 코드를 웹에 넣은 것처럼 연동 한 건을 더한다 */
export function demoAddWebLink() {
  const s = db();
  s.webLinks.push({ id: ++s.seq, createdAt: isoAt() });
}
