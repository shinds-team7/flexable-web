// 투자 성향(안정형·균형형·성장형) 시연 데이터. 기획은 docs/product/proposal-investor-type.md.
// 성향은 패시브(지수 ETF) : 액티브(고른 종목) 비율로 나눈다. 예·적금은 성향과 따로 다룬다(적금 모아보기).
// 사용자가 직접 고른 성향은 지금 이 브라우저에만 남긴다(fx.investorType, 방침 제8조).
// TODO(BE): 회원 저장 PUT /api/v1/me/investor-type, 성향 정의 GET /api/v1/investor-types, 비율 배분 계산(web-api.yaml에 먼저 추가)
// 금액·비율은 미리 계산해 둔 고정 예시다(isSample). 화면에서 계산하지 않는다(ADR-3).
// 세율·한도는 2026-10 기준 확인 전 값이다(proposal-active-passive.md §6 사실 확인 목록).
import { useSyncExternalStore } from 'react';

export type InvestorTypeId = 'stable' | 'balanced' | 'growth';

/** 상품 유형. 목록은 시세 API(ETF·코스피·코스닥)에서 실제 이름을 가져온다 */
export type ProductKind = 'krIndex' | 'globalIndex' | 'bond' | 'gold' | 'kospi' | 'kosdaq';

/* ───────── 지난 3년(2023.10부터 36개월, 매달 78,000원) ───────── */

export const MONTHLY = 78000;
export const monthLabel = (i: number) => {
  const t = 9 + i;
  return `${2023 + Math.floor(t / 12)}.${String((t % 12) + 1).padStart(2, '0')}`;
};
export const INVESTED = [
  78000, 156000, 234000, 312000, 390000, 468000, 546000, 624000, 702000, 780000, 858000, 936000, 1014000, 1092000, 1170000, 1248000, 1326000, 1404000,
  1482000, 1560000, 1638000, 1716000, 1794000, 1872000, 1950000, 2028000, 2106000, 2184000, 2262000, 2340000, 2418000, 2496000, 2574000, 2652000,
  2730000, 2808000,
];

/** 액티브 비율별로 매달 넣었다면. 0 = 패시브만(코스피200 추종 ETF), 100 = 액티브만(고른 종목 묶음). worstRate: 가장 많이 줄어 있던 때 */
export type RatioResult = { active: number; value: number; rate: number; worstRate: number; worstAt: string; recoverMonths: number; series: number[] };
export const RATIOS: RatioResult[] = [
  {
    active: 0, value: 3456830, rate: 0.231, worstRate: -0.105, worstAt: '2024.07', recoverMonths: 5,
    series: [78000, 158922, 236020, 306972, 383467, 471784, 553274, 606119, 642037, 697856, 785857, 876358, 949218, 1037693, 1185563, 1370954, 1519027, 1601239, 1676540, 1805929, 1959679, 2058329, 2094536, 2153156, 2290857, 2448369, 2532697, 2556437, 2625575, 2785030, 2946746, 3014958, 3030397, 3116269, 3297183, 3456830],
  },
  {
    active: 30, value: 3496375, rate: 0.245, worstRate: -0.152, worstAt: '2024.10', recoverMonths: 3,
    series: [78000, 158269, 233551, 301982, 375173, 461805, 548479, 612494, 652098, 688849, 738012, 794355, 859756, 962542, 1121595, 1302236, 1442366, 1530705, 1628019, 1788921, 1982751, 2125874, 2187397, 2224296, 2301565, 2414010, 2517271, 2608555, 2725368, 2865099, 2961680, 2978213, 2986336, 3095713, 3307815, 3496375],
  },
  {
    active: 50, value: 3522739, rate: 0.255, worstRate: -0.211, worstAt: '2024.10', recoverMonths: 3,
    series: [78000, 157834, 231905, 298655, 369644, 455153, 545283, 616744, 658805, 682845, 706115, 739687, 800116, 912442, 1078950, 1256425, 1391259, 1483682, 1595672, 1777583, 1998133, 2170905, 2249304, 2271724, 2308704, 2391104, 2506987, 2643301, 2791897, 2918479, 2971636, 2953716, 2956962, 3082009, 3314903, 3522739],
  },
  {
    active: 70, value: 3549103, rate: 0.264, worstRate: -0.27, worstAt: '2024.10', recoverMonths: 4,
    series: [78000, 157399, 230259, 295328, 364114, 448500, 542086, 620994, 665512, 676841, 674218, 685019, 740475, 862341, 1036304, 1210614, 1340152, 1436659, 1563324, 1766245, 2013515, 2215935, 2311211, 2319151, 2315842, 2368198, 2496703, 2678046, 2858426, 2971859, 2981592, 2929219, 2927588, 3068305, 3321991, 3549103],
  },
  {
    active: 100, value: 3588649, rate: 0.278, worstRate: -0.358, worstAt: '2024.10', recoverMonths: 6,
    series: [78000, 156747, 227791, 290339, 355821, 438522, 537292, 627370, 675574, 667835, 626374, 603017, 651014, 787191, 972337, 1141897, 1263492, 1366126, 1514804, 1749238, 2036588, 2283481, 2404073, 2390292, 2326551, 2333839, 2481278, 2730165, 2958220, 3051929, 2996527, 2892475, 2883527, 3047749, 3332624, 3588649],
  },
];
export const ratioOf = (active: number) => RATIOS.find((r) => r.active === active) ?? RATIOS[0];

/** 패시브 몫: 지수에 매달 넣기 시작한 달마다 3년 결과(시작 시점에 따라 달라요) */
export const ROLLING = [
  { start: '2016.01', rate: 0.284, worstRate: -0.062 },
  { start: '2017.01', rate: 0.062, worstRate: -0.141 },
  { start: '2018.01', rate: -0.031, worstRate: -0.187 },
  { start: '2019.01', rate: 0.31, worstRate: -0.164 },
  { start: '2020.01', rate: 0.197, worstRate: -0.233 },
  { start: '2021.01', rate: 0.024, worstRate: -0.158 },
  { start: '2022.01', rate: 0.149, worstRate: -0.121 },
  { start: '2023.01', rate: 0.263, worstRate: -0.105 },
];

/* ───────── 세 성향 ───────── */

export type InvestorType = {
  id: InvestorTypeId;
  name: string;
  oneLine: string;
  /** 원금이 줄어드는 것 / 돈을 둘 기간 */
  traits: { k: string; v: string }[];
  /** 액티브(고른 종목) 비율. 나머지는 패시브(지수 ETF) */
  active: number;
  ways: string[];
  /** 이 성향이 흔히 고르는 상품 유형(보여 주는 순서) */
  kinds: ProductKind[];
};

export const INVESTOR_TYPES: InvestorType[] = [
  {
    id: 'stable',
    name: '안정형',
    oneLine: '크게 흔들리지 않는 게 먼저예요',
    traits: [
      { k: '원금이 줄어드는 것', v: '조금만 줄어도 불안해요' },
      { k: '돈을 둘 기간', v: '3년 이상' },
    ],
    active: 30,
    ways: ['대부분을 시장 전체를 따라가는 지수 ETF에 매달 넣어요', '채권 ETF를 섞어 흔들림을 줄이는 경우가 많아요', '고른 종목은 일부만, 잘 아는 큰 회사 위주로 담아요'],
    kinds: ['krIndex', 'globalIndex', 'bond', 'kospi'],
  },
  {
    id: 'balanced',
    name: '균형형',
    oneLine: '시장만큼 가면서 조금 더 해 보고 싶어요',
    traits: [
      { k: '원금이 줄어드는 것', v: '어느 정도는 기다릴 수 있어요' },
      { k: '돈을 둘 기간', v: '3~5년' },
    ],
    active: 50,
    ways: ['지수 ETF와 고른 종목에 반씩 나눠 넣어요', '국내·해외 지수를 섞고, 금처럼 다르게 움직인 상품을 조금 더해요', '고른 종목은 여러 업종에 나눠 담아요'],
    kinds: ['krIndex', 'globalIndex', 'kospi', 'gold'],
  },
  {
    id: 'growth',
    name: '성장형',
    oneLine: '직접 골라서 더 크게 키우고 싶어요',
    traits: [
      { k: '원금이 줄어드는 것', v: '많이 줄어도 기다릴 수 있어요' },
      { k: '돈을 둘 기간', v: '5년 이상' },
    ],
    active: 70,
    ways: ['고른 종목 비중을 크게 두고, 지수 ETF로 바탕을 깔아 둬요', '사건이 생겼을 때 왜 움직였는지 짚어 보며 판단해요', '한 업종에 몰리지 않게 가진 종목을 자주 점검해요'],
    kinds: ['kospi', 'kosdaq', 'globalIndex', 'krIndex'],
  },
];

export const findType = (id: string | undefined) => INVESTOR_TYPES.find((t) => t.id === id) ?? null;

/* ───────── 성향 알아보기(질문 10개, 결과는 참고) ───────── */

// 답은 차례로 안정 1점 · 균형 2점 · 성장 3점. 합계 10~16 안정형, 17~23 균형형, 24~30 성장형.
// 결과는 참고로만 보여 주고, 성향은 사용자가 [정하기]를 눌러야 저장한다. 답은 저장하지 않는다.
export const TYPE_QUESTIONS: { q: string; a: [string, string, string] }[] = [
  { q: '투자해 본 적이 있어요?', a: ['처음이에요', '지수 ETF·펀드를 해 봤어요', '종목을 직접 사 봤어요'] },
  { q: '투자하기 전에 얼마나 알아보는 편이에요?', a: ['거의 안 알아봐요. 깊게 찾아보는 건 부담스러워요', '기사 정도는 찾아봐요', '실적·사업 내용까지 꼼꼼히 알아봐요'] },
  { q: '투자 앱을 얼마나 자주 열어 볼 것 같아요?', a: ['한 달에 한 번쯤', '일주일에 한 번쯤', '거의 매일'] },
  { q: '넣은 돈이 한 달 만에 10% 줄었어요. 어떻게 할 것 같아요?', a: ['불안해서 빼고 싶어요', '조금 더 지켜볼래요', '그대로 두고 계속 넣을래요'] },
  { q: '가진 종목 하나가 30% 내렸어요. 먼저 드는 생각은?', a: ['종목은 안 고르는 게 낫겠어요', '왜 내렸는지 찾아볼래요', '다른 종목과 비교해 다시 골라 볼래요'] },
  { q: '이 돈이 갑자기 필요해질 일이 있을까요?', a: ['있을 수 있어요', '아마 없을 거예요', '거의 없어요'] },
  { q: '이 돈을 얼마나 꺼내지 않고 둘 수 있어요?', a: ['3년 이하', '3~5년', '5년 넘게'] },
  { q: '이 돈으로 가장 바라는 건 뭐예요?', a: ['크게 잃지 않고 조금씩 불리기', '시장만큼은 따라가기', '흔들려도 크게 불리기'] },
  { q: '지난 결과를 볼 때 더 마음이 놓이는 건?', a: ['크게 줄어든 적이 없었던 것', '줄어든 만큼 다시 오른 것', '크게 줄어도 결국 많이 오른 것'] },
  { q: '더 끌리는 쪽은?', a: ['시장 전체를 따라 꾸준히', '시장을 따르면서 일부만 직접', '직접 고른 종목 위주로'] },
];

/** 답(0·1·2 = 안정·균형·성장)으로 가까운 성향 */
export function typeFromAnswers(answers: number[]): InvestorTypeId {
  const score = answers.reduce((s, a) => s + a + 1, 0);
  return score <= 16 ? 'stable' : score <= 23 ? 'balanced' : 'growth';
}

/** 상품 유형 설명. match는 ETF 이름으로 유형을 나누는 기준(시세 API 이름 그대로), skip은 빼는 이름 */
export const KINDS: Record<ProductKind, { side: '패시브' | '액티브'; title: string; desc: string; basis: string; match?: RegExp; skip?: RegExp }> = {
  krIndex: { side: '패시브', title: '국내 대표 지수 ETF', desc: '코스피200처럼 국내 시장 전체를 따라가요.', basis: '시가총액 높은 순', match: /200|코스피|KOSPI|코스닥150/, skip: /커버드콜|레버리지|인버스|선물/ },
  globalIndex: { side: '패시브', title: '해외 대표 지수 ETF', desc: 'S&P500·나스닥100처럼 해외 시장 전체를 따라가요.', basis: '시가총액 높은 순', match: /S&P|나스닥|NASDAQ|선진국/, skip: /커버드콜|레버리지|인버스|선물/ },
  bond: { side: '패시브', title: '채권 ETF', desc: '나라·회사가 빌린 돈(채권)에 나눠 넣어요. 주식보다 덜 흔들린 경우가 많아요.', basis: '시가총액 높은 순', match: /채권|국고채|국채|회사채/ },
  gold: { side: '패시브', title: '금 ETF', desc: '금 가격을 따라가요. 주식과 다르게 움직인 때가 많아요.', basis: '시가총액 높은 순', match: /금현물|골드|KRX금|금선물|GOLD/ },
  kospi: { side: '액티브', title: '코스피 종목', desc: '회사 한 곳을 골라 넣어요. 많이 오르기도, 많이 내리기도 해요.', basis: '코스피 시가총액 높은 순' },
  kosdaq: { side: '액티브', title: '코스닥 종목', desc: '성장 중인 회사가 많아요. 코스피보다 크게 흔들린 경우가 많아요.', basis: '코스닥 시가총액 높은 순' },
};

/* ───────── 계좌(어디에 담을까) ───────── */

export type AccountInfo = { name: string; use: string; holds: string; limit: string; tax: string; withdraw: string; where: string };

export const ACCOUNTS: AccountInfo[] = [
  { name: 'CMA', use: '월급 다음 날 남은 돈이 투자 전까지 머무는 곳', holds: '투자 전 현금', limit: '없음', tax: '이자에 15.4%', withdraw: '언제든 꺼낼 수 있어요', where: '증권사' },
  { name: 'ISA', use: '대부분의 돈으로 지수 ETF·종목을 사 두는 곳', holds: '지수 ETF · 국내 종목', limit: '연 2,000만 원 · 총 1억 원', tax: '수익 200만 원까지 세금 없음, 넘는 부분 9.9%(3년 유지)', withdraw: '넣은 원금 안에서 꺼낼 수 있어요', where: '증권사·은행' },
  { name: '연금저축', use: '노후 자금 + 연말정산 세액공제', holds: '지수 ETF(종목은 못 담아요)', limit: '세액공제 연 600만 원(IRP와 합쳐 900만 원)', tax: '공제율 16.5% 또는 13.2%, 연금으로 받을 때 3.3~5.5%', withdraw: '꺼낼 수 있지만 공제받은 원금·수익에 16.5%', where: '증권사·은행·보험사' },
  { name: 'IRP', use: '연금저축 한도를 채운 뒤 세액공제를 더 받는 곳', holds: '지수·채권 ETF(종목은 못 담아요)', limit: '연금저축과 합쳐 세액공제 900만 원', tax: '연금저축과 같음', withdraw: '정해진 사유(주택 구입 등) 말고는 해지해야 해요', where: '증권사·은행(계좌 수수료 확인)' },
  { name: '금현물 계좌', use: '한국거래소 금시장에서 1g 단위로 금을 사 모으는 곳', holds: '금', limit: '없음', tax: '팔아서 남긴 돈에 세금 없음, 실물로 꺼내면 부가세 10%', withdraw: '팔면 꺼낼 수 있어요', where: '증권사' },
];

export const CMA_TYPES = [
  { name: 'RP형', what: '증권사가 채권을 담보로 약속한 이자', note: '개설할 때 기본으로 고르는 곳이 많아요' },
  { name: '발행어음형', what: '대형 증권사가 발행한 어음', note: '일부 증권사만 있어요' },
  { name: 'MMW형', what: '한국증권금융 예수금 같은 단기 자산', note: '지점 방문이 필요한 곳이 있어요' },
];

/** 월급에서 모으는 돈이 계좌로 흘러가는 길(단계별 예시). 계좌 안에서 무엇을 살지는 성향 비율을 따른다 */
export type PlanStage = { id: string; label: string; salary: number; saving: number; accounts: { name: string; monthly: number; role: string }[]; taxBack: number; taxBasis: string; notes: string[] };

export const PLAN_STAGES: PlanStage[] = [
  {
    id: 'start',
    label: '사회초년생',
    salary: 3000000,
    saving: 1500000,
    accounts: [
      { name: 'ISA', monthly: 1400000, role: '대부분을 넣는 곳' },
      { name: '연금저축', monthly: 100000, role: '적은 금액으로 먼저 열어 두기' },
    ],
    taxBack: 198000,
    taxBasis: '연금저축 연 120만 원 × 16.5%(총급여 5,500만 원 이하)',
    notes: ['ISA는 넣은 원금 안에서 언제든 꺼낼 수 있어서, 급한 돈이 필요할 때도 쓸 수 있어요.', 'IRP는 중도 인출이 어려워 이 단계 예시에는 넣지 않았어요.'],
  },
  {
    id: 'mid',
    label: '대리·과장',
    salary: 4000000,
    saving: 2000000,
    accounts: [
      { name: 'ISA', monthly: 1250000, role: '고른 종목은 대부분 여기에' },
      { name: '연금저축', monthly: 500000, role: '세액공제 한도(연 600만 원)까지' },
      { name: 'IRP', monthly: 250000, role: '연금저축과 합쳐 연 900만 원까지' },
    ],
    taxBack: 1485000,
    taxBasis: '연금저축 600만 원 + IRP 300만 원 = 900만 원 × 16.5%',
    notes: ['IRP는 금융사마다 계좌 수수료가 달라요.'],
  },
  {
    id: 'senior',
    label: '차·부장',
    salary: 5500000,
    saving: 2750000,
    accounts: [
      { name: 'ISA', monthly: 1660000, role: '한도(연 2,000만 원)까지' },
      { name: '연금저축', monthly: 500000, role: '세액공제 한도까지' },
      { name: 'IRP', monthly: 250000, role: '합산 한도까지' },
      { name: '금현물 계좌', monthly: 340000, role: '한도를 다 채우고 남는 돈' },
    ],
    taxBack: 1188000,
    taxBasis: '900만 원 × 13.2%(총급여 5,500만 원 초과)',
    notes: ['모든 한도를 채운 뒤 남는 돈은 금현물 계좌(매매차익 비과세)로 나누는 방법이 있어요.'],
  },
];

export const EMERGENCY_STEPS = [
  { title: 'CMA에 남은 돈 쓰기', desc: '투자 전에 머물던 돈이라 바로 꺼낼 수 있어요.' },
  { title: 'ISA에서 원금만큼 꺼내기', desc: '넣은 원금 안에서는 세금 혜택을 유지한 채 꺼낼 수 있어요.' },
  { title: 'ISA 해지하기', desc: '3년 전에 해지하면 줄어든 세금을 다시 내요.' },
  { title: '연금 계좌 담보대출', desc: '적립금의 일정 비율 안에서 빌릴 수 있어요. 비율·금리는 금융사마다 달라요.' },
  { title: '연금저축 꺼내기·해지', desc: '세액공제 받은 원금과 수익에 16.5%를 내요.' },
];

/* ───────── 고른 성향(브라우저 저장) ───────── */

const KEY = 'fx.investorType';
const listeners = new Set<() => void>();

function read(): InvestorTypeId | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'stable' || v === 'balanced' || v === 'growth' ? v : null;
  } catch {
    return null;
  }
}
let current = read();

export function setInvestorType(id: InvestorTypeId | null) {
  current = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장이 막혀도 이 탭에서는 쓴다 */
  }
  listeners.forEach((f) => f());
}

/** 고른 투자 성향(없으면 null) */
export function useInvestorType() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => current,
  );
}
