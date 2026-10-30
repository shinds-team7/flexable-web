// 정기예금 비교 데이터(지금 가입하면). 적금(`savings.ts`)과 같은 모양이다. 목돈을 한 번에 넣고 기간 동안 두는 상품이라 매달 넣는 돈 대신 `amount`를 쓰고 적립 방식(reserveType)이 없다.
// 웹 백엔드 `/api/v1/deposit/*`가 로컬 DB(finlife 정기예금 공시 복사본)에서 읽어 계산한 값을 그대로 쓴다(ADR-3, 화면은 다시 계산하지 않는다).
// TODO(BE): 이 API는 아직 서버에 없다. 계약 초안과 구현 범위는 예금 비교 Issue·docs/product/HANDOFF.md에 있다. 계약(web-api.yaml)이 승인되면 `npm run gen:api` 타입으로 아래 타입을 대조한다(src/lib/contractChecks.ts).
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { InterestType, RateBasis, SavingsCompany, SavingsSort, SavingsTerm, Sector, SortDirection } from '@/data/savings';

export type DepositResult = {
  principal: number; // 넣은 돈(가입 한도 안)
  interestPreTax: number;
  tax: number; // floor(세전 이자 × 0.154)
  interestAfterTax: number;
  maturityAmount: number; // 원금 + 세후 이자
  excludedAmount: number; // 가입 한도를 넘어 넣지 못한 돈
  rateBasis: RateBasis;
};

export type DepositProduct = {
  id: string;
  company: string;
  name: string;
  sector: Sector;
  baseRate: number; // 연 %, 공시 그대로
  maxRate: number;
  termMonths: number;
  interestType: InterestType; // 단리 / 월복리(공시 상품마다 정해져 있다)
  disclosureMonth: string; // 'YYYY-MM'
  maxLimit: number | null; // 가입 한도(원), 없으면 null
  joinMember: string;
  joinDeny: string;
  openToAll: boolean | null;
  disclosureUrl: string;
  dataAsOf: string;
  result: DepositResult; // 요청한 amount·termMonths로 서버가 계산한 기본금리 기준 결과
};

export type DepositProductDetail = Omit<DepositProduct, 'result'> & { specialConditionText: string };

export type DepositListParams = {
  amount: number;
  termMonths: SavingsTerm;
  sort: SavingsSort;
  direction: SortDirection;
  interestType: InterestType | null; // null이면 단리·복리 모두
  sectors: Sector[];
  companies: string[]; // 비어 있으면 전체
  page: number;
  size: number;
};

export type DepositProductList = {
  items: DepositProduct[];
  total: number;
  page: number;
  size: number;
  minInterestAfterTax: number | null;
  maxInterestAfterTax: number | null;
  noRateCount: number;
  disclosureMonth: string;
  dataAsOf: string;
  notice: string;
  isSample: boolean;
};

export type DepositSimulateRequest = { productId: string; amount: number; termMonths: SavingsTerm; interestType: InterestType; rateBasis: RateBasis };
// 기간 동안 내 돈: m개월째까지 쌓인 세전 이자(약정 금리 기준). 넣은 돈(principal)은 처음부터 같다. 마지막 점 = 만기 세전 이자
export type DepositPoint = { month: number; principal: number; interestPreTax: number };
export type DepositSimulation = DepositResult & { series: DepositPoint[]; assumptions: string[]; notice: string; isSample: boolean };

async function fetchProducts(q: DepositListParams): Promise<DepositProductList> {
  const qs = new URLSearchParams({
    amount: String(q.amount),
    termMonths: String(q.termMonths),
    sort: q.sort,
    direction: q.direction,
    sectors: q.sectors.join(','),
    page: String(q.page),
    size: String(q.size),
  });
  if (q.interestType) qs.set('interestType', q.interestType);
  if (q.companies.length > 0) qs.set('companies', q.companies.join(','));
  return api<DepositProductList>(`/deposit/products?${qs}`);
}

async function fetchProduct(id: string, termMonths: SavingsTerm, interestType: InterestType): Promise<DepositProductDetail> {
  return api<DepositProductDetail>(`/deposit/products/${encodeURIComponent(id)}?termMonths=${termMonths}&interestType=${interestType}`);
}

async function simulate(q: DepositSimulateRequest): Promise<DepositSimulation> {
  return api<DepositSimulation>('/deposit/simulate', { method: 'POST', json: q });
}

export const useDepositProducts = (q: DepositListParams, enabled = true) =>
  useQuery({ queryKey: ['deposit', 'products', q], queryFn: () => fetchProducts(q), staleTime: 5 * 60_000, enabled });
export const useDepositCompanies = () =>
  useQuery({ queryKey: ['deposit', 'companies'], queryFn: () => api<SavingsCompany[]>('/deposit/companies'), staleTime: 60 * 60_000 });
export const useDepositProduct = (id: string | null, termMonths: SavingsTerm, interestType: InterestType) =>
  useQuery({ queryKey: ['deposit', 'product', id, termMonths, interestType], queryFn: () => fetchProduct(id!, termMonths, interestType), enabled: id !== null });
export const useDepositSimulation = (q: DepositSimulateRequest | null) =>
  useQuery({ queryKey: ['deposit', 'simulate', q], queryFn: () => simulate(q!), enabled: q !== null });
/** 고른 상품마다 기본금리 계산 결과(기간 선 포함). 상품 순서대로 돌려준다. */
export const useDepositSimulations = (reqs: DepositSimulateRequest[]) =>
  useQueries({ queries: reqs.map((q) => ({ queryKey: ['deposit', 'simulate', q], queryFn: () => simulate(q) })) });
