// 랜딩 예시 차트용 예시 시세·사건(와이어프레임에서 옮김). 실제 주가가 아니다.
// 랜딩 차트는 API가 죽어도 떠야 해서 빌드에 포함한다(03-architecture ADR-2).
// 주식 타임머신 화면은 서버 계산 결과(POST /api/v1/simulations/run)를 그려야 하며, 이 파일로 계산하지 않는다.
import type { ChartData } from '@/charts/drawTimeChart';

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261017);
function gauss() {
  let u = 0;
  let v = 0;
  while (!u) u = rnd();
  while (!v) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const WEEKS: Date[] = [];
for (let d = new Date(2020, 0, 6); d <= new Date(2026, 9, 12); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) WEEKS.push(d);
export const N = WEEKS.length;
const D = (y: number, m: number, dd = 1) => new Date(y, m - 1, dd).getTime();

function regime(d: Date): [number, number] {
  const t = d.getTime();
  if (t < D(2020, 2, 17)) return [0.002, 0.0015];
  if (t < D(2020, 3, 30)) return [-0.01, -0.008];
  if (t < D(2020, 9, 1)) return [0.017, 0.012];
  if (t < D(2021, 2, 1)) return [0.011, 0.008];
  if (t < D(2021, 7, 1)) return [0.001, 0.001];
  if (t < D(2022, 10, 1)) return [-0.0055, -0.0035];
  if (t < D(2023, 6, 1)) return [0.006, 0.004];
  if (t < D(2024, 8, 1)) return [0.003, 0.0015];
  if (t < D(2025, 4, 14)) return [-0.001, 0];
  return [0.0055, 0.0035];
}

export type EventKind = 'rise' | 'fall' | 'info';
export type StockKey = 'A' | 'B';
export type SourceLink = { t: string; s: string; d: string };
export type MarketEvent = {
  id: string;
  date: string;
  kind: EventKind;
  stock: StockKey | 'all';
  shock: [number, number] | null;
  title: string;
  summary: string;
  facts: string[];
  interp: string[];
  sources: SourceLink[];
  ai: boolean;
  idx: number;
};

const L = (t: string, s: string, d: string): SourceLink => ({ t, s, d });
const RAW: Omit<MarketEvent, 'idx'>[] = [
  { id: 'e1', date: '2020-02-24', kind: 'fall', stock: 'all', shock: [-0.11, -0.08], title: '코로나19 확산 우려로 첫 급락',
    summary: '해외에서 감염이 빠르게 퍼진다는 소식이 이어지며 세계 증시가 함께 크게 내렸어요. 공장이 멈추고 소비가 줄 거란 걱정이 커진 때예요.',
    facts: ['국내외 대표 지수가 한 주 사이 크게 하락', '여러 나라가 이동 제한을 발표'],
    interp: ['시장은 기업 이익이 한동안 줄 거라고 보고 위험한 자산부터 판 것으로 풀이돼요.', '해외 수요가 큰 반도체 업종이 더 크게 흔들렸어요.'],
    sources: [L('증시 급락 관련 기사 제목', '예시 매체', '2020.02.24'), L('당시 지수 흐름 자료', '예시 거래소 자료', '2020.02.28'), L('전문가 해설', '예시 매체', '2020.03.02')], ai: false },
  { id: 'e2', date: '2020-03-09', kind: 'fall', stock: 'all', shock: [-0.14, -0.12], title: '유가 급락까지 겹쳐 하락 이어짐',
    summary: '원유 값이 갑자기 크게 떨어지면서 불안이 더 커졌어요.',
    facts: ['국제 유가가 하루 새 크게 하락'],
    interp: ['감염 걱정에 유가 충격까지 겹쳐 투자자들이 현금을 쥐려 한 것으로 풀이돼요.', '변동이 커지면 개인 투자자는 손실을 확정하는 매도를 서두르기 쉬워요.'],
    sources: [L('유가 급락 기사 제목', '예시 매체', '2020.03.09'), L('원자재 시장 자료', '예시 자료', '2020.03.10'), L('해설 기사', '예시 매체', '2020.03.12')], ai: true },
  { id: 'e3', date: '2020-03-16', kind: 'fall', stock: 'all', shock: [-0.12, -0.1], title: '세계 증시 동반 급락',
    summary: '세계 여러 증시가 같은 주에 크게 내렸고, 각국이 대규모 지원책을 내놓기 시작했어요.',
    facts: ['여러 나라 중앙은행이 금리를 내림'],
    interp: ['바닥이 어디인지 모른다는 불안이 가장 컸던 때예요.', '이후 지원책이 나오며 몇 달에 걸쳐 회복했어요.'],
    sources: [L('각국 지원책 기사 제목', '예시 매체', '2020.03.17'), L('중앙은행 발표문', '예시 기관', '2020.03.16'), L('회복 과정 정리', '예시 매체', '2020.06.30')], ai: false },
  { id: 'e4', date: '2020-11-09', kind: 'rise', stock: 'all', shock: [0.12, 0.07], title: '백신 개발 소식 뒤 크게 반등',
    summary: '백신 개발이 잘 되고 있다는 발표가 나오며 경기가 살아날 거란 기대가 커졌어요.',
    facts: ['백신 임상 결과 발표', '같은 주 대표 지수 상승'],
    interp: ['멈췄던 소비·생산이 다시 돌 거라는 기대가 주가에 먼저 반영된 것으로 풀이돼요.', '그동안 많이 내렸던 업종일수록 더 크게 올랐어요.'],
    sources: [L('백신 발표 기사 제목', '예시 매체', '2020.11.09'), L('업종별 등락 자료', '예시 자료', '2020.11.13'), L('해설 기사', '예시 매체', '2020.11.16')], ai: false },
  { id: 'e5', date: '2021-01-11', kind: 'info', stock: 'A', shock: null, title: '예시 반도체주 액면분할(가치는 그대로)',
    summary: '주식 1주를 여러 주로 나눴어요. 주식 수는 늘고 1주 가격은 낮아졌지만, 내 돈의 가치는 그대로예요.',
    facts: ['1주를 5주로 분할'],
    interp: ['그래프는 분할 전 가격을 맞춰 그려서 선이 끊기지 않아요.'],
    sources: [L('분할 공시', '예시 공시', '2020.12.10')], ai: false },
  { id: 'e6', date: '2022-06-13', kind: 'fall', stock: 'all', shock: [-0.09, -0.06], title: '물가 충격에 금리 인상 우려 커짐',
    summary: '물가가 예상보다 많이 올랐다는 발표 뒤, 금리를 더 크게 올릴 거란 걱정이 퍼졌어요.',
    facts: ['물가 지표 발표', '기준금리 인상 폭 확대'],
    interp: ['금리가 오르면 미래 이익의 지금 가치가 줄어 성장주가 더 크게 내리는 경향이 있다고 풀이돼요.', '대출 이자 부담이 커져 소비가 줄 거란 걱정도 함께 반영됐어요.'],
    sources: [L('물가 발표 기사 제목', '예시 매체', '2022.06.10'), L('금리 결정 발표문', '예시 기관', '2022.06.15'), L('해설 기사', '예시 매체', '2022.06.17')], ai: true },
  { id: 'e7', date: '2023-05-29', kind: 'rise', stock: 'A', shock: [0.11, 0.03], title: 'AI 반도체 수요 기대에 급등',
    summary: 'AI용 반도체가 많이 팔릴 거란 전망이 나오며 반도체 업종이 크게 올랐어요.',
    facts: ['해외 반도체 기업 실적 발표'],
    interp: ['한 회사의 좋은 실적이 같은 업종 전체에 대한 기대로 번진 것으로 풀이돼요.', '기대가 앞서 오른 만큼, 뒤이은 실적에 따라 다시 흔들릴 수 있어요.'],
    sources: [L('실적 발표 기사 제목', '예시 매체', '2023.05.25'), L('업종 동향 자료', '예시 자료', '2023.06.02'), L('해설 기사', '예시 매체', '2023.06.05')], ai: true },
  { id: 'e8', date: '2024-08-05', kind: 'fall', stock: 'all', shock: [-0.1, -0.08], title: '경기 우려에 세계 증시 하루 새 급락',
    summary: '경기가 나빠질 수 있다는 지표와 환율 변화가 겹치며 세계 증시가 하루 새 크게 내렸어요.',
    facts: ['대표 지수 하루 큰 폭 하락'],
    interp: ['한쪽으로 몰려 있던 투자금이 한꺼번에 빠져나간 영향이 컸다고 풀이돼요.', '며칠 뒤 상당 부분을 되돌렸어요.'],
    sources: [L('급락 기사 제목', '예시 매체', '2024.08.05'), L('환율 자료', '예시 자료', '2024.08.06'), L('해설 기사', '예시 매체', '2024.08.09')], ai: false },
  { id: 'e9', date: '2025-04-07', kind: 'fall', stock: 'all', shock: [-0.09, -0.07], title: '관세 발표 충격으로 급락',
    summary: '수입품에 높은 관세를 매긴다는 발표 뒤 수출 기업 주가가 크게 내렸어요.',
    facts: ['관세 정책 발표'],
    interp: ['수출 비중이 큰 기업의 이익이 줄 거란 걱정이 반영된 것으로 풀이돼요.', '협상 소식에 따라 다시 올랐어요.'],
    sources: [L('관세 발표 기사 제목', '예시 매체', '2025.04.03'), L('수출 업종 자료', '예시 자료', '2025.04.08'), L('해설 기사', '예시 매체', '2025.04.14')], ai: true },
];

export const EVENTS: MarketEvent[] = RAW.map((e) => {
  const [y, m, d] = e.date.split('-').map(Number);
  const t = D(y, m, d);
  let best = 0;
  WEEKS.forEach((w, i) => {
    if (Math.abs(w.getTime() - t) < Math.abs(WEEKS[best].getTime() - t)) best = i;
  });
  return { ...e, idx: best };
});

const evAt: Record<number, MarketEvent> = {};
EVENTS.forEach((e) => (evAt[e.idx] = e));
const PA = [100];
const PB = [100];
for (let i = 1; i < N; i++) {
  const [mA, mB] = regime(WEEKS[i]);
  const ev = evAt[i];
  let ra: number;
  let rb: number;
  if (ev && ev.shock) [ra, rb] = ev.shock;
  else {
    const z = gauss();
    const z2 = 0.6 * z + 0.8 * gauss();
    ra = Math.max(-0.055, Math.min(0.055, mA + 0.024 * z));
    rb = Math.max(-0.04, Math.min(0.04, mB + 0.015 * z2));
  }
  PA.push(PA[i - 1] * (1 + ra));
  PB.push(PB[i - 1] * (1 + rb));
}
export const PRICES: Record<StockKey, number[]> = { A: PA, B: PB };
export const STOCKS: Record<StockKey, { name: string; color: string }> = {
  A: { name: '예시 반도체주', color: 'var(--s1)' },
  B: { name: '예시 대표지수 ETF', color: 'var(--s2)' },
};

export type Sim = { total: number[]; principal: number[]; vA: number[]; vB: number[]; startIdx: number };

/** 예시 차트용 간이 계산(두 종목 반반). 실제 계산은 서버 몫이다. */
export function simulateSample({ amount, how, startIdx, pace = 78000 }: { amount: number; how: 'lump' | 'split' | 'pace'; startIdx: number; pace?: number }): Sim {
  const months: number[] = [];
  for (let i = startIdx; i < N; i++) if (i === startIdx || WEEKS[i].getDate() <= 7) months.push(i);
  const contrib: Record<number, number> = {};
  if (how === 'lump') contrib[startIdx] = amount;
  else if (how === 'split') months.forEach((i, k) => (contrib[i] = Math.floor(amount / months.length) + (k === 0 ? amount % months.length : 0)));
  else months.forEach((i) => (contrib[i] = pace));
  let uA = 0;
  let uB = 0;
  let princ = 0;
  const total: number[] = [];
  const principal: number[] = [];
  const vA: number[] = [];
  const vB: number[] = [];
  for (let i = 0; i < N; i++) {
    if (contrib[i]) {
      uA += (contrib[i] * 0.5) / PA[i];
      uB += (contrib[i] * 0.5) / PB[i];
      princ += contrib[i];
    }
    const a = uA * PA[i];
    const b = uB * PB[i];
    vA.push(a);
    vB.push(b);
    total.push(a + b);
    principal.push(princ);
  }
  return { total, principal, vA, vB, startIdx };
}

/** 사건 주간의 등락률과 그때 내 돈 변화(넣은 돈 제외) */
export function evChange(e: MarketEvent, sim: Sim) {
  const i = e.idx;
  let p: number;
  if (e.kind === 'info') p = 0;
  else if (e.stock === 'A') p = PA[i] / PA[i - 1] - 1;
  else if (e.stock === 'B') p = PB[i] / PB[i - 1] - 1;
  else p = sim.total[i - 1] > 0 ? sim.total[i] / sim.total[i - 1] - 1 : PA[i] / PA[i - 1] - 1;
  const vals = e.stock === 'A' ? sim.vA : e.stock === 'B' ? sim.vB : sim.total;
  const before = vals[i - 1] || 0;
  const after = vals[i] || 0;
  const contribution = (sim.principal[i] - sim.principal[i - 1]) * (e.stock === 'all' ? 1 : 0.5);
  return { p, before, after, diff: after - before - contribution };
}

/** 예시 계산 결과를 차트 입력 모양으로 바꾼다(랜딩 전용). */
export function sampleChartData(sim: Sim): ChartData {
  const half = sim.principal.map((v) => v / 2);
  return {
    dates: WEEKS,
    total: sim.total,
    invested: sim.principal,
    startIdx: sim.startIdx,
    legs: [
      { ...STOCKS.A, values: sim.vA, invested: half },
      { ...STOCKS.B, values: sim.vB, invested: half },
    ],
    events: EVENTS.map((e) => {
      const c = evChange(e, sim);
      return { id: e.id, idx: e.idx, kind: e.kind, title: e.title, leg: e.stock === 'all' ? null : e.stock === 'A' ? 0 : 1, sourceName: e.sources[0].s + ' (예시)', change: { p: c.p, before: c.before, diff: c.diff } };
    }),
  };
}
