// 투자 시뮬레이션 데이터. 웹 백엔드(backend/)의 market·simulation API를 부른다. 시세는 worker가 모아 DB에 둔 것이다. 금액은 모두 서버 계산값이다(ADR-3).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type Board = 'KOSPI' | 'KOSDAQ' | 'ETF';
/** rank: 그 시장 시가총액 순위(1부터). marketCap: 원(어림값일 수 있음) */
export type Instrument = { id: string; name: string; market: string | null; kind: 'STOCK' | 'ETF' | string; board: Board; rank: number; marketCap: number | null };
/** note: 기본 소스 대신 대체 소스를 쓴 이유 등. worker가 아직 모으지 않았으면 items가 비고 source·dataAsOf가 null */
export type BoardListing = { board: Board; items: Instrument[]; source: string | null; note: string | null; dataAsOf: string | null };

export type FundingMode = 'LUMP_SUM' | 'SPLIT' | 'PACE';
export type SimulationRequest = {
  startDate: string; // YYYY-MM-01
  // LUMP_SUM은 totalAmount 한 번, SPLIT·PACE는 monthlyAmount를 매달 일정하게
  funding: { mode: FundingMode; totalAmount?: number; monthlyAmount?: number };
  legs: { instrumentId: string; weight?: number }[]; // weight 0~1(0.35=35%), 합 1. 비우면 서버가 같은 비율로 나눈다
};

export type SimPoint = {
  weekStart: string;
  date: string | null; // 그 주 마지막 거래일
  tradingDays: number;
  total: number;
  invested: number; // 누적 넣은 돈
  contributed: number; // 이 주에 넣은 돈
  profit: number;
  returnRate: number;
  legs: { id: string; close: number | null; value: number; invested: number }[];
};
export type SimulationResult = {
  resolvedInput: { startDate: string; endDate: string; mode: FundingMode };
  contributionCount: number;
  monthlyAmount: number;
  totalInvested: number;
  finalValue: number;
  profit: number;
  returnRate: number;
  engineVersion: string;
  dataAsOf: string;
  seriesBasis: 'WEEK_LAST_CLOSE';
  legs: { id: string; name: string; kind: string; weight: number; invested: number; finalValue: number }[];
  series: SimPoint[];
  events: never[];
  assumptions: string[];
  noticeKey: string;
  notice: string;
  sources: { name: string; note: string }[];
};

/** 시장별 시가총액 상위 종목(서버 설정, 기본 100개) */
export const useBoard = (board: Board) =>
  useQuery({ queryKey: ['market', 'instruments', board], queryFn: () => api<BoardListing>(`/market/instruments?board=${board}`), staleTime: 30 * 60_000 });

/** req가 null이면 부르지 않는다. "결과 보기"를 누를 때만 req를 바꾼다. */
export const useSimulation = (req: SimulationRequest | null) =>
  useQuery({
    queryKey: ['simulation', req],
    queryFn: () => api<SimulationResult>('/simulations/run', { method: 'POST', json: req }),
    enabled: req != null,
    retry: false,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
