/**
 * 시연용 Mock 데이터. 실제 서비스는 이 파일을 쓰지 않고 서버 API만 쓴다.
 * 오늘 날짜 기준으로 "지난 정산 주기 ~ 오늘" 거래를 생성하므로 언제 열어도 자연스럽다.
 * 시드 고정 난수를 써서 새로고침해도 같은 내역이 나온다.
 */
import type { CategoryId } from './categories';
import { addDays, cycleStart, endOfMonth, startOfDay, toKey } from '@/utils/date';

export type TxStatus = 'confirmed' | 'pending';

export type Transaction = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  merchant: string;
  category: CategoryId;
  amount: number; // 지출은 음수, 수입은 양수
  account: string;
  /** 계좌 잔액에서 바로 빠지는 거래인지 (신용카드는 false → 미결제 카드 이용액) */
  debit: boolean;
  status: TxStatus;
  /** 연결된 예정 지출 */
  planId?: string;
  memo?: string;
  /** 반영 제외 (회사 경비, 대신 결제 후 돌려받을 돈 등) */
  excluded?: boolean;
  /** 1/N 정산 인원 — 내 부담 = amount / splitN */
  splitN?: number;
};

export type Account = {
  id: string;
  bank: string;
  name: string;
  number: string;
  type: 'bank' | 'card';
};

export const USER = { name: '김플렉스', email: 'flex@shinhan-ds.dev' };

export const ACCOUNTS: Account[] = [
  { id: 'a1', bank: '신한은행', name: '쏠편한 입출금통장', number: '110-***-482910', type: 'bank' },
  { id: 'a2', bank: '신한카드', name: 'Deep Dream 체크', number: '5107-****-****-2231', type: 'card' },
  { id: 'a3', bank: '신한카드', name: 'Mr.Life 신용', number: '4518-****-****-9032', type: 'card' },
];

export const DEFAULT_INCOME = { amount: 2300000, payday: 25, source: '급여 (주)한빛소프트' };

export type FixedExpense = { id: string; day: number; name: string; amount: number };
export const DEFAULT_FIXED: FixedExpense[] = [
  { id: 'f1', day: 1, name: '청년도약계좌 자동이체', amount: 400000 },
  { id: 'f2', day: 5, name: '월세', amount: 450000 },
  { id: 'f3', day: 10, name: '넷플릭스', amount: 13500 },
  { id: 'f4', day: 15, name: '휴대폰 요금', amount: 59000 },
  { id: 'f5', day: 17, name: '유튜브 프리미엄', amount: 14900 },
  { id: 'f6', day: 20, name: '실손보험', amount: 32000 },
];

export type Protected = { id: string; name: string; amount: number };
export const DEFAULT_PROTECTED: Protected[] = [
  { id: 'pr1', name: '비상금', amount: 500000 },
  { id: 'pr2', name: '이번 달 추가 저축', amount: 300000 },
];

/** 이번 정산 주기 시작(월급 입금 직전) 통장 잔액 */
export const OPENING_BALANCE = 680000;

/** 신용카드 결제일 */
export const CARD_PAY_DAY = 14;

// ───────────────────────── 거래내역 생성 ─────────────────────────

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Tpl = { c: CategoryId; m: string[]; min: number; max: number; w: number; t: [number, number] };

const TEMPLATES: Tpl[] = [
  { c: 'food', m: ['김밥천국', '본죽&비빔밥', '맘스터치', '배달의민족', '쿠팡이츠', '홍콩반점', '서브웨이', '한솥도시락'], min: 7000, max: 19000, w: 30, t: [11, 20] },
  { c: 'cafe', m: ['스타벅스', '메가MGC커피', '투썸플레이스', '컴포즈커피', '파리바게뜨', 'GS25'], min: 2000, max: 7500, w: 26, t: [8, 17] },
  { c: 'transport', m: ['티머니 교통', '카카오T 택시', '코레일'], min: 1500, max: 14000, w: 16, t: [7, 23] },
  { c: 'living', m: ['이마트24', '다이소', '홈플러스 익스프레스', '올리브영'], min: 3000, max: 28000, w: 12, t: [12, 22] },
  { c: 'shopping', m: ['무신사', '쿠팡', '29CM', '네이버페이'], min: 12000, max: 59000, w: 8, t: [13, 23] },
  { c: 'culture', m: ['CGV', '인터파크 티켓', '교보문고', '코인노래방'], min: 6000, max: 22000, w: 6, t: [15, 23] },
  { c: 'etc', m: ['편의점 택배', '세탁특공대'], min: 3000, max: 15000, w: 2, t: [10, 20] },
];

const CARDS = [
  { name: 'Deep Dream 체크', debit: true, w: 0.5 },
  { name: 'Mr.Life 신용', debit: false, w: 0.3 },
  { name: '쏠편한 입출금통장', debit: true, w: 0.2 },
];

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function pickTpl(rnd: () => number): Tpl {
  const total = TEMPLATES.reduce((a, t) => a + t.w, 0);
  let r = rnd() * total;
  for (const t of TEMPLATES) if ((r -= t.w) <= 0) return t;
  return TEMPLATES[0];
}

function pickCard(rnd: () => number) {
  let r = rnd();
  for (const c of CARDS) if ((r -= c.w) <= 0) return c;
  return CARDS[0];
}

const hm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function genDay(date: Date, rnd: () => number, out: Transaction[], scale: number) {
  const key = toKey(date);
  const count = 1 + Math.floor(rnd() * 3.2);
  for (let i = 0; i < count; i++) {
    const t = pickTpl(rnd);
    const amount = Math.round(((t.min + rnd() * (t.max - t.min)) * scale) / 100) * 100;
    const card = pickCard(rnd);
    out.push({
      id: `${key}-${i}`,
      date: key,
      time: hm(t.t[0] + Math.floor(rnd() * (t.t[1] - t.t[0])), Math.floor(rnd() * 60)),
      merchant: pick(rnd, t.m),
      category: t.c,
      amount: -amount,
      account: card.name,
      debit: card.debit,
      status: 'confirmed',
    });
  }
}

function genFixedAndIncome(from: Date, until: Date, payday: number, income: number, fixed: FixedExpense[], out: Transaction[]) {
  for (let d = from; d <= until; d = addDays(d, 1)) {
    const key = toKey(d);
    for (const f of fixed) {
      if (Math.min(f.day, endOfMonth(d).getDate()) !== d.getDate()) continue;
      out.push({ id: `${key}-fx-${f.id}`, date: key, time: '09:00', merchant: f.name, category: 'fixed', amount: -f.amount, account: '쏠편한 입출금통장', debit: true, status: 'confirmed' });
    }
    if (d.getDate() === Math.min(payday, endOfMonth(d).getDate())) {
      out.push({ id: `${key}-income`, date: key, time: '10:12', merchant: DEFAULT_INCOME.source, category: 'income', amount: income, account: '쏠편한 입출금통장', debit: true, status: 'confirmed' });
    }
  }
}

/** 시연 시나리오용 특수 거래 (확인 필요 거래, 일정과 연결될 거래, 오늘 거래) */
function scenario(today: Date): Transaction[] {
  const k = (n: number) => toKey(addDays(today, n));
  return [
    { id: 'today-1', date: k(0), time: '08:26', merchant: '메가MGC커피', category: 'cafe', amount: -2000, account: 'Deep Dream 체크', debit: true, status: 'confirmed' },
    { id: 'today-2', date: k(0), time: '12:03', merchant: '한솥도시락', category: 'food', amount: -6900, account: 'Deep Dream 체크', debit: true, status: 'confirmed' },
    { id: 'gift', date: k(-1), time: '21:40', merchant: '카카오톡 선물하기', category: 'shopping', amount: -24900, account: 'Mr.Life 신용', debit: false, status: 'confirmed' },
    // 1/N 시연용: 회식에서 내가 4명분을 한 번에 결제
    { id: 'nbbang', date: k(-1), time: '22:47', merchant: '역전할맥 신촌점', category: 'food', amount: -96000, account: 'Mr.Life 신용', debit: false, status: 'confirmed' },
    // 반영 제외 시연용: 동아리 비품을 대신 결제 (나중에 돌려받음)
    { id: 'proxy', date: k(-2), time: '15:20', merchant: '다이소 홍대점', category: 'living', amount: -27500, account: 'Deep Dream 체크', debit: true, status: 'confirmed' },
    { id: 'tr-1', date: k(-2), time: '19:47', merchant: '카카오페이 송금 이준호', category: 'transfer', amount: -12000, account: '쏠편한 입출금통장', debit: true, status: 'confirmed' },
  ];
}

export function buildTransactions(today: Date, payday: number, income: number, fixed: FixedExpense[]): Transaction[] {
  const t0 = startOfDay(today);
  const cur = cycleStart(t0, payday);
  const prev = cycleStart(addDays(cur, -1), payday);
  const out: Transaction[] = [];

  const rndP = seeded(prev.getFullYear() * 100 + prev.getMonth() + 7);
  for (let d = prev; d < cur; d = addDays(d, 1)) genDay(d, rndP, out, 1.3);

  const rndC = seeded(cur.getFullYear() * 100 + cur.getMonth() + 11);
  for (let d = cur; d < t0; d = addDays(d, 1)) genDay(d, rndC, out, 1.4);

  genFixedAndIncome(prev, t0, payday, income, fixed, out);
  out.push(...scenario(t0));
  return out.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
}

// ───────────────────────── 캘린더 연동 Mock ─────────────────────────

export type CalendarEvent = { id: string; title: string; offset: number; time?: string; color: string };

/** 구글 캘린더에서 불러온 것처럼 보이는 일정 (오늘 기준 offset 일) */
export const CALENDAR_EVENTS: CalendarEvent[] = [
  { id: 'c1', title: '아카데미 회식', offset: 6, time: '19:00', color: '#7A5AF8' },
  { id: 'c2', title: '민지 생일', offset: 8, color: '#EE46BC' },
  { id: 'c3', title: '치과 정기검진', offset: 4, time: '10:30', color: '#2E90FA' },
  { id: 'c4', title: '스터디 (카페)', offset: 3, time: '14:00', color: '#12B76A' },
  { id: 'c5', title: '팀 프로젝트 발표', offset: 11, color: '#F79009' },
];
