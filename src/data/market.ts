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
/**
 * 기간 안 급변동 사건(서버 탐지, 03 C-8). code는 종목 사건의 종목(시장 사건이면 null). 수익률은 비율(0.05 = 5%).
 * 이때 내 돈: valueBefore(시작 전날) → valueAfter(마지막 날), valueChange = after − before − 그 사이 넣은 돈. 아직 넣기 전이면 null.
 */
export type SimEvent = {
  id: number;
  code: string | null;
  scope: 'STOCK' | 'MARKET';
  startDate: string;
  endDate: string;
  windowDays: number;
  direction: 'RISE' | 'FALL';
  returnRate: number;
  marketReturn: number | null;
  headline: string;
  hasExplanation: boolean;
  sourceName: string | null;
  sourceCount: number;
  topSource: string | null;
  score: number;
  valueBefore: number | null;
  valueAfter: number | null;
  contributionInWindow: number | null;
  valueChange: number | null;
  noticeKey: string;
};

export type EvidenceSource = { type: string; externalId: string; title: string; publisher: string | null; date: string; url: string; weight: number };
/** 사건 상세(GET /market/events/{id}). whatHappened는 설명이 없으면 null, 근거가 하나도 없으면 고정 문장. */
export type EventDetail = {
  id: number;
  code: string | null;
  name: string | null; // 시장 사건이면 null
  scope: 'STOCK' | 'MARKET';
  startDate: string;
  endDate: string;
  windowDays: number;
  direction: 'RISE' | 'FALL';
  headline: string;
  marketReaction: { returnRate: number; marketReturn: number | null; volumeRatio: number | null; weekReturn: number | null };
  afterwards: { d30: number | null; d365: number | null };
  sources: EvidenceSource[];
  newsSearchUrl: string | null; // 검색어를 만들 수 없으면 null
  whatHappened: string | null;
  aiGenerated: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  noticeKey: string;
  notice: string;
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
  events: SimEvent[];
  assumptions: string[];
  noticeKey: string;
  notice: string;
  sources: { name: string; note: string | null }[];
};

/** 시장별 시가총액 상위 종목(서버 설정, 기본 100개) */
export const useBoard = (board: Board) =>
  useQuery({ queryKey: ['market', 'instruments', board], queryFn: () => api<BoardListing>(`/market/instruments?board=${board}`), staleTime: 30 * 60_000 });

/** 사건 상세. id가 null이면 부르지 않는다. 지난 일이라 자주 바뀌지 않는다. */
export const useEventDetail = (id: number | null) =>
  useQuery({ queryKey: ['market', 'event', id], queryFn: () => api<EventDetail>(`/market/events/${id}`), enabled: id != null, staleTime: 30 * 60_000 });

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
