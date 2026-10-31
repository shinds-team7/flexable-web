// 예금·파킹·CMA 예시 데이터. 서버 API(#140·#144·#145)가 나오기 전까지 화면을 채우는 용도다. 실제 상품·금리가 아니다.
// 모든 응답에 isSample=true와 "예시" 안내를 달고, API가 연결되면(VITE_LUMP_SAMPLE=false) 이 파일은 쓰지 않으므로 지운다.
// ADR-3(계산은 서버)의 임시 예외: 조건을 바꿔 가며 보는 화면이라 미리 계산한 값을 둘 수 없어, 같은 계산 규칙(원 단위 내림, 세금 floor(세전 × 15.4%))을 여기서 한다.
// 회사 이름은 대표 은행 줄·은행 선택창을 시연하려고 실제 금융회사 이름을 쓰지만 상품 이름·금리·한도는 모두 꾸며 낸 값이다.
import type { DepositPoint, DepositProduct, DepositProductDetail, DepositProductList, DepositListParams, DepositSimulateRequest, DepositSimulation, LumpKind } from '@/data/deposit';
import type { InterestType, RateBasis, SavingsCompany, SavingsTerm, Sector } from '@/data/savings';

const BANKS = ['국민은행', '신한은행', '하나은행', '우리은행', '농협은행주식회사', '기업은행', '부산은행', '광주은행', '전북은행', '경남은행', '제주은행', '카카오뱅크', '토스뱅크', '케이뱅크'];
const SAVINGS_BANKS = ['OK저축은행', 'SBI저축은행', '웰컴저축은행', 'KB저축은행', 'DB저축은행', '다올저축은행', '고려저축은행', '대명저축은행', '한국투자저축은행', '페퍼저축은행'];
const BROKERS = ['미래에셋증권', '삼성증권', 'NH투자증권', '한국투자증권', 'KB증권', '키움증권', '신한투자증권', '하나증권'];
const CMA_TYPES = ['RP형', 'MMF형', '종금형', '발행어음형'];
const NOUN: Record<LumpKind, string> = { deposit: '정기예금', parking: '파킹통장', cma: 'CMA' };
const LETTERS = ['A', 'B', 'C'];

const NOTICE = '예시 데이터예요. 실제 상품과 금리가 아니에요. 실제 공시 데이터는 준비 중이에요.';

type Raw = {
  id: string;
  company: string;
  sector: Sector;
  name: string;
  base: number;
  max: number;
  type: InterestType;
  category: string | null;
  protected: boolean | null;
  rateLimit: number | null;
};

const build = (kind: LumpKind): Raw[] => {
  const companies: [string, Sector][] =
    kind === 'cma' ? BROKERS.map((c) => [c, 'BANK']) : [...BANKS.map((c): [string, Sector] => [c, 'BANK']), ...SAVINGS_BANKS.map((c): [string, Sector] => [c, 'SAVINGS_BANK'])];
  return companies.flatMap(([company, sector], i) =>
    [0, 1].map((j): Raw => {
      const base = +(2.1 + ((i * 7 + j * 13) % 15) / 10).toFixed(2);
      const max = +(base + ((i * 5 + j * 11) % 12) / 10).toFixed(2);
      return {
        id: `${kind}-${i}-${j}`,
        company,
        sector,
        name: `예시 ${NOUN[kind]} ${LETTERS[(i + j) % LETTERS.length]}${j + 1}`,
        base,
        max,
        type: kind === 'deposit' && (i + j) % 3 === 0 ? 'COMPOUND' : 'SIMPLE',
        category: kind === 'cma' ? CMA_TYPES[(i + j * 2) % CMA_TYPES.length] : null,
        protected: kind === 'cma' ? CMA_TYPES[(i + j * 2) % CMA_TYPES.length] === '종금형' : kind === 'parking' ? true : null,
        rateLimit: kind === 'parking' ? [3_000_000, 5_000_000, 10_000_000][(i + j) % 3] : null,
      };
    }),
  );
};
const DATA: Record<LumpKind, Raw[]> = { deposit: build('deposit'), parking: build('parking'), cma: build('cma') };

const accrued = (amount: number, months: number, ratePct: number, type: InterestType) =>
  type === 'COMPOUND' ? Math.floor(amount * (Math.pow(1 + ratePct / 1200, months) - 1)) : Math.floor((amount * Math.round(ratePct * 100) * months) / 12 / 10000);

const result = (amount: number, months: number, ratePct: number, type: InterestType, basis: RateBasis) => {
  const pre = accrued(amount, months, ratePct, type);
  const tax = Math.floor(pre * 0.154);
  return { principal: amount, interestPreTax: pre, tax, interestAfterTax: pre - tax, maturityAmount: amount + pre - tax, excludedAmount: 0, rateBasis: basis };
};

const asProduct = (r: Raw, amount: number, term: number): DepositProduct => ({
  id: r.id,
  company: r.company,
  name: r.name,
  sector: r.sector,
  baseRate: r.base,
  maxRate: r.max,
  termMonths: term,
  interestType: r.type,
  disclosureMonth: '2026-10',
  maxLimit: null,
  joinMember: '예시 데이터라 실제 가입 대상이 아니에요',
  joinDeny: '예시 데이터라 실제 가입 제한이 아니에요',
  openToAll: null,
  disclosureUrl: 'https://finlife.fss.or.kr',
  dataAsOf: '2026-10-31',
  category: r.category,
  depositProtected: r.protected,
  rateLimit: r.rateLimit,
  result: result(amount, term, r.base, r.type, 'BASE'),
});

const find = (kind: LumpKind, id: string) => {
  const r = DATA[kind].find((x) => x.id === id);
  if (!r) throw new Error('예시 상품을 찾지 못했어요');
  return r;
};

export const sampleCompanies = (kind: LumpKind): SavingsCompany[] => {
  const m = new Map<string, SavingsCompany>();
  DATA[kind].forEach((r) => m.set(r.company, { name: r.company, sector: r.sector }));
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
};

export function sampleList(kind: LumpKind, q: DepositListParams): DepositProductList {
  const items = DATA[kind]
    .filter(
      (r) =>
        q.sectors.includes(r.sector) &&
        (q.companies.length === 0 || q.companies.includes(r.company)) &&
        (!q.interestType || r.type === q.interestType) &&
        (q.categories.length === 0 || (r.category !== null && q.categories.includes(r.category))),
    )
    .map((r) => asProduct(r, q.amount, q.termMonths));
  const key = q.sort === 'MAX_RATE' ? 'maxRate' : 'baseRate';
  items.sort((a, b) => (q.direction === 'ASC' ? a[key] - b[key] : b[key] - a[key]) || a.name.localeCompare(b.name, 'ko'));
  const after = items.map((p) => p.result.interestAfterTax);
  const start = (q.page - 1) * q.size;
  return {
    items: items.slice(start, start + q.size),
    total: items.length,
    page: q.page,
    size: q.size,
    minInterestAfterTax: after.length ? Math.min(...after) : null,
    maxInterestAfterTax: after.length ? Math.max(...after) : null,
    noRateCount: 0,
    disclosureMonth: '2026-10',
    dataAsOf: '2026-10-31',
    notice: NOTICE,
    isSample: true,
  };
}

export function sampleDetail(kind: LumpKind, id: string, termMonths: SavingsTerm): DepositProductDetail {
  const { result: _result, ...rest } = asProduct(find(kind, id), 0, termMonths);
  return { ...rest, specialConditionText: '예시 데이터예요. 우대조건 원문이 아니에요.' };
}

export function sampleSimulate(kind: LumpKind, q: DepositSimulateRequest): DepositSimulation {
  const r = find(kind, q.productId);
  const rate = q.rateBasis === 'MAX' ? r.max : r.base;
  const series: DepositPoint[] = [];
  for (let m = 1; m <= q.termMonths; m++) series.push({ month: m, principal: q.amount, interestPreTax: accrued(q.amount, m, rate, q.interestType) });
  return { ...result(q.amount, q.termMonths, rate, q.interestType, q.rateBasis), series, assumptions: ['예시 데이터라 실제 상품·금리가 아니에요'], notice: NOTICE, isSample: true };
}
