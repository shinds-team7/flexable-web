// 적금 비교 데이터([지금 가입하면] / [그때 들었다면] / [정책 적금]). 지금은 서버 API가 없어 예시 값을 돌려준다.
// 계약 초안은 project2 docs/web/03-architecture.md §8(엔드포인트·필드), 계산 정의는 C-12. API가 생기면 fetch 함수 안만 바꾼다.
// 금액은 모두 서버 계산 결과다. 예시 값도 C-12로 미리 계산해 둔 상수이고, 화면에서 다시 계산하지 않는다.
// 예시는 매달 78,000원(시연 페르소나 '지수'의 저축 속도) 조건만 있다. 다른 조건은 SAMPLE_ONLY 오류로 알린다.
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

export type SavingsSort = 'BASE_RATE' | 'MAX_RATE' | 'TERM';
export type SortDirection = 'DESC' | 'ASC';
export type RateBasis = 'BASE' | 'MAX'; // MAX = 우대조건을 모두 채운 경우 가정. 개인 조건 판정 없음
export type ReserveType = 'FIXED' | 'FREE'; // 정액적립식 / 자유적립식
export type InterestType = 'SIMPLE' | 'COMPOUND'; // 단리 / 월복리
export type Sector = 'BANK' | 'SAVINGS_BANK'; // 은행 / 저축은행
export type SavingsTerm = 6 | 12 | 24 | 36;

export type SavingsResult = {
  principal: number; // 넣은 돈(월 한도 안)
  interestPreTax: number;
  tax: number; // floor(세전 이자 × 0.154)
  interestAfterTax: number;
  maturityAmount: number; // 원금 + 세후 이자
  excludedAmount: number; // 월 한도를 넘어 넣지 못한 돈
  rateBasis: RateBasis;
};

export type SavingsProduct = {
  id: string;
  company: string;
  name: string;
  sector: Sector; // TODO(BE): 03 §8-2 목록 필드에 없음. finlife 권역 코드로 내려 달라고 맞출 것
  baseRate: number; // 연 %, 공시 그대로(예: 3.3)
  maxRate: number;
  termMonths: number;
  reserveType: ReserveType;
  interestType: InterestType;
  disclosureMonth: string; // 공시 기준월 'YYYY-MM'
  maxLimit: number | null; // 월 한도(원), 없으면 null
  joinMember: string; // 가입 대상 원문
  joinDeny: string; // 가입 제한 원문
  openToAll: boolean | null;
  disclosureUrl: string;
  dataAsOf: string;
  result: SavingsResult; // 요청한 monthly·termMonths로 서버가 계산한 기본금리 기준 결과. TODO(BE): 목록 응답에 넣을지 계약에서 확정
};

export type SavingsProductDetail = Omit<SavingsProduct, 'result'> & { specialConditionText: string };

export type SavingsListParams = {
  monthly: number;
  termMonths: SavingsTerm;
  sort: SavingsSort; // 사용자가 고른 정렬만. 순위(rank)는 응답에 없다
  direction: SortDirection;
  reserveType: ReserveType;
  sectors: Sector[];
};

export type SavingsProductList = {
  items: SavingsProduct[];
  noRateCount: number; // 금리가 비어 목록에서 뺀 상품 수("금리 정보 없음 n개")
  disclosureMonth: string;
  dataAsOf: string;
  notice: string;
  isSample: boolean;
};

export type SavingsSimulateRequest = { productId: string; monthly: number; termMonths: SavingsTerm; rateBasis: RateBasis };
export type SavingsSimulation = SavingsResult & { assumptions: string[]; notice: string; isSample: boolean };

// 그때 들었다면: 상품 없이 한국은행 평균 적금 한 줄
export type AverageSavingsRequest = { from: string; to: string; monthly?: number }; // monthly가 없으면 서버가 시드머니 주기별 남긴 돈을 쓴다
export type AverageSavingsResult = {
  name: string;
  rates: { month: string; rate: number }[]; // 납입한 달의 평균 금리(연 %)
  series: { month: string; principal: number; valueAfterTax: number }[]; // 기간 동안 내 돈 선
  principal: number;
  interestPreTax: number;
  tax: number;
  interestAfterTax: number;
  total: number;
  source: string;
  assumptions: string[];
  notice: string;
  isSample: boolean;
};

// 정책 적금(청년미래적금): 조건 직접 입력, 자격 판정·가입 연결 없음
export type PolicyType = 'GENERAL' | 'PREFERRED';
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED';
export type PolicySavingsRules = {
  code: string;
  name: string;
  termMonths: number;
  maxMonthly: number;
  contributionRates: Record<PolicyType, number>; // 정부기여율 %
  defaultBankRate: number; // 연 %, 사용자가 고칠 수 있다
  taxFree: boolean;
  rulesVersion: string;
  verificationStatus: VerificationStatus;
  sourceUrl: string | null; // 기획이 준 공식 안내 링크만. 없으면 화면에 "확인 중"
  asOf: string;
  checklist: string[]; // 자격 조건 확인하기(판정하지 않음)
  assumptions: string[];
  notice: string;
  isSample: boolean;
};
export type PolicySimulateRequest = { code: string; monthly: number; termMonths: number; type: PolicyType; bankRate: number };
export type PolicySimulation = {
  principal: number;
  govContribution: number;
  interestPreTax: number;
  tax: number; // 비과세라 0
  total: number;
  averageSavingsComparison: { name: string; rate: number; interestAfterTax: number; total: number };
  rulesVersion: string;
  verificationStatus: VerificationStatus;
  assumptions: string[];
  notice: string;
  isSample: boolean;
};

// 고지 문구는 서버 상수(03 §8-3, 01 F2-b)를 그대로 쓴다
const SAVINGS_EST = '공시 금리로 계산한 추정이에요. 은행 계산과 조금 다를 수 있고 우대조건은 직접 확인해야 해요.';
const POLICY_EST = '공식 안내 기준으로 계산한 추정이에요. 자격과 금리는 신청할 때 꼭 확인해 주세요.';

const SAMPLE_MONTHLY = 78000;
const SAMPLE_AS_OF = '2026-10-17';
const SAMPLE_MONTH = '2026-10';

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));
const sampleOnly = () => new ApiError(400, 'SAMPLE_ONLY', '예시에서는 매달 78,000원 기본 조건만 계산해요');

type SampleProduct = Omit<SavingsProductDetail, 'termMonths' | 'disclosureMonth' | 'disclosureUrl' | 'dataAsOf'>;
const SAMPLE_PRODUCTS: SampleProduct[] = [
  { id: 'p1', company: '예시은행 가', name: '청년 첫걸음 적금', sector: 'BANK', baseRate: 3.0, maxRate: 4.3, reserveType: 'FIXED', interestType: 'SIMPLE', maxLimit: 500000, joinMember: '만 19~34세 개인', joinDeny: '1인 1계좌', openToAll: false, specialConditionText: '1. 이 은행 계좌로 급여이체 6개월 이상: 연 0.6%p\n2. 이 은행 카드 월 30만 원 이상 사용: 연 0.5%p\n3. 앱으로 가입: 연 0.2%p' },
  { id: 'p2', company: '예시은행 나', name: '매일 조금 적금', sector: 'BANK', baseRate: 3.3, maxRate: 3.9, reserveType: 'FIXED', interestType: 'SIMPLE', maxLimit: 300000, joinMember: '실명의 개인', joinDeny: '제한 없음', openToAll: true, specialConditionText: '1. 적금 자동이체 12회 이상: 연 0.3%p\n2. 이 은행 첫 거래: 연 0.3%p' },
  { id: 'p3', company: '예시은행 다', name: '사회초년생 우대 적금', sector: 'BANK', baseRate: 2.6, maxRate: 4.5, reserveType: 'FIXED', interestType: 'SIMPLE', maxLimit: 470000, joinMember: '입사 3년 이내 직장인', joinDeny: '1인 1계좌', openToAll: false, specialConditionText: '1. 급여이체: 연 1.0%p\n2. 카드 월 30만 원 이상 사용: 연 0.7%p\n3. 마케팅 수신 동의: 연 0.2%p' },
  { id: 'p4', company: '예시저축은행 라', name: '라온 정기적금', sector: 'SAVINGS_BANK', baseRate: 3.9, maxRate: 4.2, reserveType: 'FIXED', interestType: 'SIMPLE', maxLimit: 470000, joinMember: '실명의 개인', joinDeny: '제한 없음', openToAll: true, specialConditionText: '1. 앱으로 가입: 연 0.3%p' },
  { id: 'p5', company: '예시은행 마', name: '모으기 습관 적금', sector: 'BANK', baseRate: 2.9, maxRate: 4.4, reserveType: 'FIXED', interestType: 'COMPOUND', maxLimit: 500000, joinMember: '실명의 개인', joinDeny: '제한 없음', openToAll: true, specialConditionText: '1. 적금 자동이체: 연 0.4%p\n2. 앱으로 가입: 연 0.3%p\n3. 카드 월 30만 원 이상 사용: 연 0.8%p' },
  { id: 'p6', company: '예시은행 바', name: '목돈 만들기 적금', sector: 'BANK', baseRate: 3.5, maxRate: 3.5, reserveType: 'FIXED', interestType: 'SIMPLE', maxLimit: 2000000, joinMember: '실명의 개인', joinDeny: '제한 없음', openToAll: true, specialConditionText: '우대조건 없음' },
  { id: 'p7', company: '예시저축은행 사', name: '첫 저축 적금', sector: 'SAVINGS_BANK', baseRate: 3.6, maxRate: 4.5, reserveType: 'FIXED', interestType: 'SIMPLE', maxLimit: 300000, joinMember: '이 저축은행 첫 거래 고객', joinDeny: '1인 1계좌', openToAll: false, specialConditionText: '1. 이 저축은행 첫 거래: 연 0.6%p\n2. 마케팅 수신 동의: 연 0.3%p' },
  { id: 'p8', company: '예시은행 아', name: '급여 플러스 적금', sector: 'BANK', baseRate: 2.4, maxRate: 4.9, reserveType: 'FIXED', interestType: 'SIMPLE', maxLimit: 470000, joinMember: '이 은행 급여이체 고객', joinDeny: '1인 1계좌', openToAll: false, specialConditionText: '1. 급여이체: 연 1.5%p\n2. 카드 월 30만 원 이상 사용: 연 1.0%p' },
];

// 매달 78,000원 × 기간별 C-12 결과 [원금, 세전 이자, 세금, 세후 이자, 만기 수령액, 한도 초과분]. 예시 상품은 기간과 관계없이 같은 금리로 둔다.
type R = [number, number, number, number, number, number];
const SAMPLE_RESULTS: Record<string, Record<SavingsTerm, Record<RateBasis, R>>> = {
  p1: { 6: { BASE: [468000, 4095, 630, 3465, 471465, 0], MAX: [468000, 5865, 903, 4962, 472962, 0] }, 12: { BASE: [936000, 15210, 2342, 12868, 948868, 0], MAX: [936000, 21792, 3355, 18437, 954437, 0] }, 24: { BASE: [1872000, 58500, 9009, 49491, 1921491, 0], MAX: [1872000, 83832, 12910, 70922, 1942922, 0] }, 36: { BASE: [2808000, 129870, 19999, 109871, 2917871, 0], MAX: [2808000, 186120, 28662, 157458, 2965458, 0] } },
  p2: { 6: { BASE: [468000, 4503, 693, 3810, 471810, 0], MAX: [468000, 5322, 819, 4503, 472503, 0] }, 12: { BASE: [936000, 16728, 2576, 14152, 950152, 0], MAX: [936000, 19770, 3044, 16726, 952726, 0] }, 24: { BASE: [1872000, 64344, 9908, 54436, 1926436, 0], MAX: [1872000, 76044, 11710, 64334, 1936334, 0] }, 36: { BASE: [2808000, 142848, 21998, 120850, 2928850, 0], MAX: [2808000, 168822, 25998, 142824, 2950824, 0] } },
  p3: { 6: { BASE: [468000, 3549, 546, 3003, 471003, 0], MAX: [468000, 6141, 945, 5196, 473196, 0] }, 12: { BASE: [936000, 13182, 2030, 11152, 947152, 0], MAX: [936000, 22812, 3513, 19299, 955299, 0] }, 24: { BASE: [1872000, 50700, 7807, 42893, 1914893, 0], MAX: [1872000, 87744, 13512, 74232, 1946232, 0] }, 36: { BASE: [2808000, 112554, 17333, 95221, 2903221, 0], MAX: [2808000, 194796, 29998, 164798, 2972798, 0] } },
  p4: { 6: { BASE: [468000, 5322, 819, 4503, 472503, 0], MAX: [468000, 5733, 882, 4851, 472851, 0] }, 12: { BASE: [936000, 19770, 3044, 16726, 952726, 0], MAX: [936000, 21294, 3279, 18015, 954015, 0] }, 24: { BASE: [1872000, 76044, 11710, 64334, 1936334, 0], MAX: [1872000, 81900, 12612, 69288, 1941288, 0] }, 36: { BASE: [2808000, 168822, 25998, 142824, 2950824, 0], MAX: [2808000, 181818, 27999, 153819, 2961819, 0] } },
  p5: { 6: { BASE: [468000, 3971, 611, 3360, 471360, 0], MAX: [468000, 6041, 930, 5111, 473111, 0] }, 12: { BASE: [936000, 14827, 2283, 12544, 948544, 0], MAX: [936000, 22607, 3481, 19126, 955126, 0] }, 24: { BASE: [1872000, 57597, 8869, 48728, 1920728, 0], MAX: [1872000, 88252, 13590, 74662, 1946662, 0] }, 36: { BASE: [2808000, 129133, 19886, 109247, 2917247, 0], MAX: [2808000, 198869, 30625, 168244, 2976244, 0] } },
  p6: { 6: { BASE: [468000, 4776, 735, 4041, 472041, 0], MAX: [468000, 4776, 735, 4041, 472041, 0] }, 12: { BASE: [936000, 17742, 2732, 15010, 951010, 0], MAX: [936000, 17742, 2732, 15010, 951010, 0] }, 24: { BASE: [1872000, 68244, 10509, 57735, 1929735, 0], MAX: [1872000, 68244, 10509, 57735, 1929735, 0] }, 36: { BASE: [2808000, 151506, 23331, 128175, 2936175, 0], MAX: [2808000, 151506, 23331, 128175, 2936175, 0] } },
  p7: { 6: { BASE: [468000, 4914, 756, 4158, 472158, 0], MAX: [468000, 6141, 945, 5196, 473196, 0] }, 12: { BASE: [936000, 18252, 2810, 15442, 951442, 0], MAX: [936000, 22812, 3513, 19299, 955299, 0] }, 24: { BASE: [1872000, 70200, 10810, 59390, 1931390, 0], MAX: [1872000, 87744, 13512, 74232, 1946232, 0] }, 36: { BASE: [2808000, 155844, 23999, 131845, 2939845, 0], MAX: [2808000, 194796, 29998, 164798, 2972798, 0] } },
  p8: { 6: { BASE: [468000, 3276, 504, 2772, 470772, 0], MAX: [468000, 6687, 1029, 5658, 473658, 0] }, 12: { BASE: [936000, 12168, 1873, 10295, 946295, 0], MAX: [936000, 24840, 3825, 21015, 957015, 0] }, 24: { BASE: [1872000, 46800, 7207, 39593, 1911593, 0], MAX: [1872000, 95544, 14713, 80831, 1952831, 0] }, 36: { BASE: [2808000, 103896, 15999, 87897, 2895897, 0], MAX: [2808000, 212112, 32665, 179447, 2987447, 0] } },
};

const toResult = ([principal, interestPreTax, tax, interestAfterTax, maturityAmount, excludedAmount]: R, rateBasis: RateBasis): SavingsResult => ({
  principal, interestPreTax, tax, interestAfterTax, maturityAmount, excludedAmount, rateBasis,
});

const sampleDetail = (p: SampleProduct, termMonths: number): SavingsProductDetail => ({
  ...p, termMonths, disclosureMonth: SAMPLE_MONTH, disclosureUrl: 'https://finlife.fss.or.kr', dataAsOf: SAMPLE_AS_OF,
});

const assumptionsOf = (p: SampleProduct) => [
  p.interestType === 'SIMPLE' ? '정액적립식 단리, 회차마다 이자를 원 단위로 내림' : '정액적립식 월복리, 회차마다 이자를 원 단위로 내림',
  '세금은 이자의 15.4%로 단순 계산(내림)',
  '우대조건은 계산에 넣지 않아요',
];

// TODO(BE): GET /api/v1/savings/products?monthly&termMonths&sort&direction&reserveType&sectors (03 §8-1). 기본 BASE_RATE 내림차순
async function fetchProducts(q: SavingsListParams): Promise<SavingsProductList> {
  if (q.monthly !== SAMPLE_MONTHLY) throw sampleOnly();
  const key: Record<SavingsSort, (p: SampleProduct) => number> = { BASE_RATE: (p) => p.baseRate, MAX_RATE: (p) => p.maxRate, TERM: () => q.termMonths };
  const sign = q.direction === 'DESC' ? -1 : 1;
  const items = SAMPLE_PRODUCTS.filter((p) => q.sectors.includes(p.sector) && p.reserveType === q.reserveType)
    .sort((a, b) => sign * (key[q.sort](a) - key[q.sort](b)) || b.baseRate - a.baseRate)
    .map((p): SavingsProduct => {
      const { specialConditionText: _omit, ...item } = sampleDetail(p, q.termMonths); // 우대조건 원문은 상세에만
      return { ...item, result: toResult(SAMPLE_RESULTS[p.id][q.termMonths].BASE, 'BASE') };
    });
  return delay({ items, noRateCount: 0, disclosureMonth: SAMPLE_MONTH, dataAsOf: SAMPLE_AS_OF, notice: SAVINGS_EST, isSample: true });
}

// TODO(BE): GET /api/v1/savings/products/{id}. 우대조건 원문은 상세에만
async function fetchProduct(id: string, termMonths: SavingsTerm): Promise<SavingsProductDetail> {
  const p = SAMPLE_PRODUCTS.find((x) => x.id === id);
  if (!p) throw new ApiError(404, 'PRODUCT_NOT_FOUND', '상품을 찾지 못했어요');
  return delay(sampleDetail(p, termMonths));
}

// TODO(BE): POST /api/v1/savings/simulate {productId, monthly, termMonths, rateBasis}
async function simulate(q: SavingsSimulateRequest): Promise<SavingsSimulation> {
  const p = SAMPLE_PRODUCTS.find((x) => x.id === q.productId);
  if (!p) throw new ApiError(404, 'PRODUCT_NOT_FOUND', '상품을 찾지 못했어요');
  if (q.monthly !== SAMPLE_MONTHLY) throw sampleOnly();
  const assumptions = [...assumptionsOf(p), ...(q.rateBasis === 'MAX' ? ['최고금리는 우대조건을 모두 채운 경우예요'] : [])];
  return delay({ ...toResult(SAMPLE_RESULTS[p.id][q.termMonths][q.rateBasis], q.rateBasis), assumptions, notice: SAVINGS_EST, isSample: true });
}

// TODO(BE·DATA): POST /api/v1/savings/average/simulate {from, to, monthly?}. ECOS 정기적금 항목코드 확인 전이라 금리는 예시
async function fetchAverage(q: AverageSavingsRequest): Promise<AverageSavingsResult> {
  if (q.monthly !== undefined) throw sampleOnly();
  return delay({
    name: '은행 평균 적금(한국은행)',
    rates: [
      { month: '2026-04', rate: 3.1 }, { month: '2026-05', rate: 3.05 }, { month: '2026-06', rate: 3.0 },
      { month: '2026-07', rate: 2.95 }, { month: '2026-08', rate: 2.95 }, { month: '2026-09', rate: 2.9 },
    ],
    series: [
      { month: '2026-04', principal: 74000, valueAfterTax: 74162 }, { month: '2026-05', principal: 155000, valueAfterTax: 155497 },
      { month: '2026-06', principal: 233000, valueAfterTax: 233998 }, { month: '2026-07', principal: 312000, valueAfterTax: 313663 },
      { month: '2026-08', principal: 392000, valueAfterTax: 394494 }, { month: '2026-09', principal: 470000, valueAfterTax: 473485 },
    ],
    principal: 470000,
    interestPreTax: 4119,
    tax: 634,
    interestAfterTax: 3485,
    total: 473485,
    source: '한국은행 ECOS · 은행 평균 적금 금리 · 2026년 9월 기준 · 이 금리로 계산한 추정',
    assumptions: [
      '정산 주기마다 남긴 돈을 그달에 넣었다고 가정',
      '납입한 달의 평균 금리를 고정해 단리로 계산, 만기·재가입·복리 없음',
      '상품별 과거 금리는 없어 은행 평균 한 줄로만 보여 줘요',
    ],
    notice: SAVINGS_EST,
    isSample: true,
  });
}

const POLICY_ASSUMPTIONS = ['기여금은 만기에 한 번에 받는다고 가정, 기여금에는 이자 없음', '기여금 적립 방식 확인 중 · 추정', '이자는 정액적립식 단리, 비과세'];

// TODO(BE·기획): GET /api/v1/savings/policy/{code}. 규칙·기본 금리는 policy_savings에 사람이 넣는다(출처·기준일 필수)
async function fetchPolicy(code: string): Promise<PolicySavingsRules> {
  if (code !== 'YOUTH_FUTURE') throw new ApiError(404, 'POLICY_NOT_FOUND', '정책 적금을 찾지 못했어요');
  return delay({
    code,
    name: '청년미래적금',
    termMonths: 36,
    maxMonthly: 500000,
    contributionRates: { GENERAL: 6, PREFERRED: 12 },
    defaultBankRate: 2.9,
    taxFree: true,
    rulesVersion: 'sample-2026-10',
    verificationStatus: 'UNVERIFIED',
    sourceUrl: null,
    asOf: '2026-10-18',
    checklist: ['만 19~34세인가요?', '공고문의 소득 기준을 확인했나요?', '소득정보 제공 동의와 서류를 기간 안에 낼 수 있나요?'],
    assumptions: POLICY_ASSUMPTIONS,
    notice: POLICY_EST,
    isSample: true,
  });
}

// TODO(BE): POST /api/v1/savings/policy/{code}/simulate {monthly, termMonths, type, bankRate}
async function simulatePolicy(q: PolicySimulateRequest): Promise<PolicySimulation> {
  if (q.code !== 'YOUTH_FUTURE') throw new ApiError(404, 'POLICY_NOT_FOUND', '정책 적금을 찾지 못했어요');
  if (q.monthly !== SAMPLE_MONTHLY || q.termMonths !== 36 || q.bankRate !== 2.9) throw sampleOnly();
  const gov = q.type === 'GENERAL' ? 168480 : 336960;
  return delay({
    principal: 2808000,
    govContribution: gov,
    interestPreTax: 125532,
    tax: 0,
    total: 2808000 + gov + 125532,
    averageSavingsComparison: { name: '은행 평균 적금(한국은행)', rate: 2.9, interestAfterTax: 106201, total: 2914201 },
    rulesVersion: 'sample-2026-10',
    verificationStatus: 'UNVERIFIED',
    assumptions: POLICY_ASSUMPTIONS,
    notice: POLICY_EST,
    isSample: true,
  });
}

export const useSavingsProducts = (q: SavingsListParams) =>
  useQuery({ queryKey: ['savings', 'products', q], queryFn: () => fetchProducts(q), staleTime: 5 * 60_000 });
export const useSavingsProduct = (id: string | null, termMonths: SavingsTerm) =>
  useQuery({ queryKey: ['savings', 'product', id, termMonths], queryFn: () => fetchProduct(id!, termMonths), enabled: id !== null });
export const useSavingsSimulation = (q: SavingsSimulateRequest | null) =>
  useQuery({ queryKey: ['savings', 'simulate', q], queryFn: () => simulate(q!), enabled: q !== null });
export const useAverageSavings = (q: AverageSavingsRequest) =>
  useQuery({ queryKey: ['savings', 'average', q], queryFn: () => fetchAverage(q) });
export const usePolicySavings = (code: string) =>
  useQuery({ queryKey: ['savings', 'policy', code], queryFn: () => fetchPolicy(code), staleTime: 5 * 60_000 });
export const usePolicySimulation = (q: PolicySimulateRequest | null) =>
  useQuery({ queryKey: ['savings', 'policy', 'simulate', q], queryFn: () => simulatePolicy(q!), enabled: q !== null });
