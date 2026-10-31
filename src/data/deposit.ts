// 정기예금·파킹통장·CMA 비교 데이터(지금 가입하면). 세 가지가 같은 모양이라 kind로 경로만 바꾼다(`/deposit/*`·`/parking/*`·`/cma/*`).
// 정기예금 기준 설명: 적금(`savings.ts`)과 같은 모양이다. 목돈을 한 번에 넣고 기간 동안 두는 상품이라 매달 넣는 돈 대신 `amount`를 쓰고 적립 방식(reserveType)이 없다.
// 웹 백엔드 `/api/v1/deposit/*`가 로컬 DB(finlife 정기예금 공시 복사본)에서 읽어 계산한 값을 그대로 쓴다(ADR-3, 화면은 다시 계산하지 않는다).
// 정기예금(`/deposit/*`)은 계약(web-api.yaml)에 있고 타입을 src/lib/contractChecks.ts가 대조한다. 서버 구현은 #140이다.
// TODO(BE): 파킹·CMA(`/parking/*`·`/cma/*`)는 계약이 아직 없다(#144·#145). 전용 필드(category·depositProtected·rateLimit)는 그때 확정한다.
import { useQueries, useQuery } from '@tanstack/react-query';
import { sampleCompanies, sampleDetail, sampleList, sampleSimulate } from '@/data/depositSample';
import { api } from '@/lib/api';
import type { InterestType, RateBasis, SavingsCompany, SavingsSort, SavingsTerm, Sector, SortDirection } from '@/data/savings';

export type LumpKind = 'deposit' | 'parking' | 'cma';

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
  // 파킹·CMA 전용(예금은 null). 서버 계약 전 제안이라 #143에서 확정한다
  category: string | null; // CMA 상품 종류(RP형·MMF형·종금형·발행어음형). 파킹은 null
  depositProtected: boolean | null; // 예금자보호 대상 여부, 확인 못 하면 null
  rateLimit: number | null; // 파킹: 우대금리가 적용되는 금액 한도(원), 없으면 null
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
  categories: string[]; // CMA 상품 종류. 비어 있으면 전체
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

// 서버 API(#140·#144·#145)가 나오기 전까지 예시 데이터를 보여 준다. API가 연결되면 환경 변수 VITE_LUMP_SAMPLE=false로 끈다.
const USE_SAMPLE = import.meta.env.VITE_LUMP_SAMPLE !== 'false';
const later = <T,>(v: () => T) => new Promise<T>((resolve, reject) => setTimeout(() => { try { resolve(v()); } catch (e) { reject(e); } }, 150));

async function fetchProducts(kind: LumpKind, q: DepositListParams): Promise<DepositProductList> {
  if (USE_SAMPLE) return later(() => sampleList(kind, q));
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
  if (q.categories.length > 0) qs.set('categories', q.categories.join(','));
  const res = await api<DepositProductList>(`/${kind}/products?${qs}`);
  return kind === 'deposit' ? { ...res, items: res.items.map(withLumpFields) } : res;
}

// 정기예금 계약에는 파킹·CMA 전용 필드가 없어서 화면 타입에 맞춰 null로 채운다
const withLumpFields = (p: DepositProduct): DepositProduct => ({ ...p, category: p.category ?? null, depositProtected: p.depositProtected ?? null, rateLimit: p.rateLimit ?? null });
const withLumpDetail = (p: DepositProductDetail): DepositProductDetail => ({ ...p, category: p.category ?? null, depositProtected: p.depositProtected ?? null, rateLimit: p.rateLimit ?? null });

async function fetchProduct(kind: LumpKind, id: string, termMonths: SavingsTerm, interestType: InterestType): Promise<DepositProductDetail> {
  if (USE_SAMPLE) return later(() => sampleDetail(kind, id, termMonths));
  const res = await api<DepositProductDetail>(`/${kind}/products/${encodeURIComponent(id)}?termMonths=${termMonths}&interestType=${interestType}`);
  return kind === 'deposit' ? withLumpDetail(res) : res;
}

async function simulate(kind: LumpKind, q: DepositSimulateRequest): Promise<DepositSimulation> {
  if (USE_SAMPLE) return later(() => sampleSimulate(kind, q));
  return api<DepositSimulation>(`/${kind}/simulate`, { method: 'POST', json: q });
}

export const useDepositProducts = (kind: LumpKind, q: DepositListParams, enabled = true) =>
  useQuery({ queryKey: [kind, 'products', q], queryFn: () => fetchProducts(kind, q), staleTime: 5 * 60_000, enabled });
export const useDepositCompanies = (kind: LumpKind) =>
  useQuery({ queryKey: [kind, 'companies'], queryFn: () => (USE_SAMPLE ? later(() => sampleCompanies(kind)) : api<SavingsCompany[]>(`/${kind}/companies`)), staleTime: 60 * 60_000 });
export const useDepositProduct = (kind: LumpKind, id: string | null, termMonths: SavingsTerm, interestType: InterestType) =>
  useQuery({ queryKey: [kind, 'product', id, termMonths, interestType], queryFn: () => fetchProduct(kind, id!, termMonths, interestType), enabled: id !== null });
export const useDepositSimulation = (kind: LumpKind, q: DepositSimulateRequest | null) =>
  useQuery({ queryKey: [kind, 'simulate', q], queryFn: () => simulate(kind, q!), enabled: q !== null });
/** 고른 상품마다 기본금리 계산 결과(기간 선 포함). 상품 순서대로 돌려준다. */
export const useDepositSimulations = (kind: LumpKind, reqs: DepositSimulateRequest[]) =>
  useQueries({ queries: reqs.map((q) => ({ queryKey: [kind, 'simulate', q], queryFn: () => simulate(kind, q) })) });
