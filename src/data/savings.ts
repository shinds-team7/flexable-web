// 적금 비교 데이터(지금 가입하면: 일반 적금 상품 + 정책 적금).
// 일반 적금 상품은 웹 백엔드(/api/v1/savings/*)가 로컬 DB(finlife 공시 복사본)에서 읽어 계산한 값을 그대로 쓴다.
// 정책 적금(청년미래적금)은 아직 서버 API가 없어 예시 값을 돌려준다.
// 2026-10-20 사용자 결정으로 [그때 들었다면](POST /savings/average/simulate)은 화면에서 뺐다.
// 계약 초안은 docs/product/03-architecture.md §8(엔드포인트·필드), 계산 정의는 C-12. API가 생기면 fetch 함수 안만 바꾼다.
// 금액은 모두 서버 계산 결과다. 정책 적금 예시 값도 C-12로 미리 계산해 둔 상수이고, 화면에서 다시 계산하지 않는다.
// 정책 적금 예시는 매달 78,000원(시연 페르소나 '지수'의 저축 속도) 조건만 있다. 다른 조건은 SAMPLE_ONLY 오류로 알린다.
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
  sector: Sector; // finlife 권역(020000 은행, 030300 저축은행)
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
  result: SavingsResult; // 요청한 monthly·termMonths로 서버가 계산한 기본금리 기준 결과
};

export type SavingsProductDetail = Omit<SavingsProduct, 'result'> & { specialConditionText: string };

export type SavingsListParams = {
  monthly: number;
  termMonths: SavingsTerm;
  sort: SavingsSort; // 사용자가 고른 정렬만. 순위(rank)는 응답에 없다
  direction: SortDirection;
  reserveType: ReserveType;
  sectors: Sector[];
  companies: string[]; // 비어 있으면 전체
  page: number; // 1부터
  size: number;
};

export type SavingsProductList = {
  items: SavingsProduct[]; // 요청한 쪽만
  total: number; // 조건에 맞는 전체 상품 수
  page: number;
  size: number;
  minInterestAfterTax: number | null; // 전체 기준 만기 세후 이자 범위
  maxInterestAfterTax: number | null;
  noRateCount: number; // 금리가 비어 목록에서 뺀 상품 수("금리 정보 없음 n개")
  disclosureMonth: string;
  dataAsOf: string;
  notice: string;
  isSample: boolean;
};

export type SavingsSimulateRequest = { productId: string; monthly: number; termMonths: SavingsTerm; reserveType: ReserveType; rateBasis: RateBasis };
// 기간 동안 내 돈: m개월 끝까지 넣은 돈과 그때까지 쌓인 세전 이자(약정 금리 기준). 마지막 점 = 만기 세전 이자
export type SavingsPoint = { month: number; principal: number; interestPreTax: number };
export type SavingsSimulation = SavingsResult & { series: SavingsPoint[]; assumptions: string[]; notice: string; isSample: boolean };

// 정책 적금(청년미래적금): 조건 직접 입력, 자격 판정·가입 연결 없음
export type PolicyType = 'GENERAL' | 'PREFERRED';
export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED';
export type PolicySavingsRules = {
  code: string;
  name: string;
  termMonths: number;
  maxMonthly: number;
  contributionRates: Record<PolicyType, number>; // 정부기여율 %
  contributionEarnsInterest: boolean;
  taxFree: boolean;
  rulesVersion: string;
  verificationStatus: VerificationStatus;
  sourceUrl: string | null; // 공식 안내 링크. 없으면 화면에 "확인 중"
  asOf: string;
  checklist: string[]; // 자격 조건 확인하기(판정하지 않음)
  assumptions: string[];
  notice: string;
  isSample: boolean;
};
// 기본금리·우대금리는 은행마다 달라 사용자가 넣는다(policies §9)
export type PolicySimulateRequest = { code: string; joinDate: string; monthly: number; type: PolicyType; baseRate: number; bonusRate: number };
export type PolicySimulation = {
  maturityDate: string;
  principal: number;
  govContribution: number;
  ownInterest: number;
  contributionInterest: number;
  interestPreTax: number;
  tax: number; // 비과세라 0
  total: number;
  averageSavingsComparison: { name: string; rate: number; interestAfterTax: number; total: number } | null;
  rulesVersion: string;
  verificationStatus: VerificationStatus;
  assumptions: string[];
  notice: string;
  isSample: boolean;
};

async function fetchProducts(q: SavingsListParams): Promise<SavingsProductList> {
  const qs = new URLSearchParams({
    monthly: String(q.monthly),
    termMonths: String(q.termMonths),
    sort: q.sort,
    direction: q.direction,
    reserveType: q.reserveType,
    sectors: q.sectors.join(','),
    page: String(q.page),
    size: String(q.size),
  });
  if (q.companies.length > 0) qs.set('companies', q.companies.join(','));
  return api<SavingsProductList>(`/savings/products?${qs}`);
}

async function fetchProduct(id: string, termMonths: SavingsTerm, reserveType: ReserveType): Promise<SavingsProductDetail> {
  return api<SavingsProductDetail>(`/savings/products/${encodeURIComponent(id)}?termMonths=${termMonths}&reserveType=${reserveType}`);
}

async function simulate(q: SavingsSimulateRequest): Promise<SavingsSimulation> {
  return api<SavingsSimulation>('/savings/simulate', { method: 'POST', json: q });
}

async function fetchPolicy(code: string): Promise<PolicySavingsRules> {
  return api<PolicySavingsRules>(`/savings/policy/${encodeURIComponent(code)}`);
}

async function simulatePolicy(q: PolicySimulateRequest): Promise<PolicySimulation> {
  const { code, ...body } = q;
  return api<PolicySimulation>(`/savings/policy/${encodeURIComponent(code)}/simulate`, { method: 'POST', json: body });
}

export const useSavingsProducts = (q: SavingsListParams, enabled = true) =>
  useQuery({ queryKey: ['savings', 'products', q], queryFn: () => fetchProducts(q), staleTime: 5 * 60_000, enabled });
export type SavingsCompany = { name: string; sector: Sector };

// 청년정책(적금·저축·통장 계열, 온통청년). 금리가 없어 계산하지 않고 안내 정보만 보여 준다.
export type YouthPolicy = {
  id: string;
  name: string;
  summary: string | null;
  support: string | null;
  category: string | null;
  agency: string | null;
  operator: string | null;
  applyPeriod: string | null;
  bizPeriod: string | null;
  minAge: number | null;
  maxAge: number | null;
  applyMethod: string | null;
  screening: string | null;
  documents: string | null;
  applyUrl: string | null;
  refUrl: string | null;
  etc: string | null;
  incomeNote: string | null;
  qualification: string | null;
  restriction: string | null;
  region: string; // 서울·부산·…·제주, 광주·전남. 중앙부처 정책은 '전국'
  dataAsOf: string;
};
export const useYouthPolicies = (ids: string[], enabled = true) =>
  useQuery({
    queryKey: ['savings', 'youth-policies', ids.join(',')],
    queryFn: () => api<YouthPolicy[]>('/savings/policies' + (ids.length > 0 ? `?ids=${encodeURIComponent(ids.join(','))}` : '')),
    staleTime: 60 * 60_000,
    enabled,
  });
export const useSavingsCompanies = () =>
  useQuery({ queryKey: ['savings', 'companies'], queryFn: () => api<SavingsCompany[]>('/savings/companies'), staleTime: 60 * 60_000 });
export const useSavingsProduct = (id: string | null, termMonths: SavingsTerm, reserveType: ReserveType) =>
  useQuery({ queryKey: ['savings', 'product', id, termMonths, reserveType], queryFn: () => fetchProduct(id!, termMonths, reserveType), enabled: id !== null });
export const useSavingsSimulation = (q: SavingsSimulateRequest | null) =>
  useQuery({ queryKey: ['savings', 'simulate', q], queryFn: () => simulate(q!), enabled: q !== null });
/** 고른 상품마다 기본금리 계산 결과(기간 선 포함). 상품 순서대로 돌려준다. */
export const useSavingsSimulations = (reqs: SavingsSimulateRequest[]) =>
  useQueries({ queries: reqs.map((q) => ({ queryKey: ['savings', 'simulate', q], queryFn: () => simulate(q) })) });
export const usePolicySavings = (code: string) =>
  useQuery({ queryKey: ['savings', 'policy', code], queryFn: () => fetchPolicy(code), staleTime: 5 * 60_000 });
export const usePolicySimulation = (q: PolicySimulateRequest | null) =>
  useQuery({ queryKey: ['savings', 'policy', 'simulate', q], queryFn: () => simulatePolicy(q!), enabled: q !== null });
