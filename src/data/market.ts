// 투자 인사이트 데이터. 웹 백엔드(backend/)의 market API를 부른다. 시세는 worker가 모아 DB에 둔 것이다. 금액·등락률은 모두 서버 값이다(ADR-3).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { components } from '@/lib/api-schema';

export type Board = 'KOSPI' | 'KOSDAQ' | 'ETF';
/** rank: 그 시장 시가총액 순위(1부터). marketCap: 원(어림값일 수 있음) */
export type Instrument = { id: string; name: string; market: string | null; kind: 'STOCK' | 'ETF' | string; board: Board; rank: number; marketCap: number | null };
/** note: 기본 소스 대신 대체 소스를 쓴 이유 등. worker가 아직 모으지 않았으면 items가 비고 source·dataAsOf가 null */
export type BoardListing = { board: Board; items: Instrument[]; source: string | null; note: string | null; dataAsOf: string | null };

/**
 * 기간 안 급변동 사건(서버 탐지, 03 C-8). code는 종목 사건의 종목(시장 사건이면 null). 수익률은 비율(0.05 = 5%).
 * 이때 내 돈(valueBefore 등)은 POST /simulations/run 응답에만 있고, 투자 인사이트 사건(PriceEvent)에는 없다.
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
  name: string;
  scope: 'STOCK' | 'MARKET';
  startDate: string;
  endDate: string;
  windowDays: number;
  direction: 'RISE' | 'FALL';
  headline: string;
  marketReaction: { returnRate: number; marketReturn: number | null; volumeRatio: number | null; weekReturn: number | null };
  afterwards: { d30: number | null; d365: number | null };
  sources: EvidenceSource[];
  newsSearchUrl: string;
  whatHappened: string | null;
  aiGenerated: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  noticeKey: string;
  notice: string;
};

/** 시장별 시가총액 상위 종목(서버 설정, 기본 100개) */
export const useBoard = (board: Board) =>
  useQuery({ queryKey: ['market', 'instruments', board], queryFn: () => api<BoardListing>(`/market/instruments?board=${board}`), staleTime: 30 * 60_000 });

/** 사건 상세. id가 null이면 부르지 않는다. 지난 일이라 자주 바뀌지 않는다. */
export const useEventDetail = (id: number | null) =>
  useQuery({ queryKey: ['market', 'event', id], queryFn: () => api<EventDetail>(`/market/events/${id}`), enabled: id != null, staleTime: 30 * 60_000 });

export type PricePeriod = components['schemas']['PricePeriod'];
/** 화면 차트용 일별 종가(수정주가). 시가·고가·저가·거래량은 없다(decisions/2026-10-26-invest-insight-redesign ④) */
export type PriceSeries = components['schemas']['PriceSeries'];
/** 사건 핀(금액 필드 없음). 상세는 useEventDetail */
export type PriceEvent = components['schemas']['PriceEvents']['items'][number];
export type IndexStrip = components['schemas']['IndexStrip'];
export type IndexItem = IndexStrip['items'][number];
export type IndustryListing = components['schemas']['IndustryListing'];

/** 종목 일별 종가. id가 null이면 부르지 않는다. 기간을 바꾸는 동안 이전 차트를 둔다 */
export const usePrices = (id: string | null, period: PricePeriod) =>
  useQuery({
    queryKey: ['market', 'prices', id, period],
    queryFn: () => api<PriceSeries>(`/market/instruments/${encodeURIComponent(id!)}/prices?period=${period}`),
    enabled: id != null,
    retry: false,
    staleTime: 30 * 60_000,
    placeholderData: keepPreviousData,
  });

/** 같은 기간의 사건 핀(종목 사건 + 시장 사건) */
export const usePriceEvents = (id: string | null, period: PricePeriod) =>
  useQuery({
    queryKey: ['market', 'price-events', id, period],
    queryFn: () => api<components['schemas']['PriceEvents']>(`/market/instruments/${encodeURIComponent(id!)}/events?period=${period}`),
    enabled: id != null,
    retry: false,
    staleTime: 30 * 60_000,
  });

/** 상단 시장 띠. 수집된 칸만 온다 */
export const useIndices = () => useQuery({ queryKey: ['market', 'indices'], queryFn: () => api<IndexStrip>('/market/indices'), staleTime: 10 * 60_000 });

/** 업종별 시가총액 상위 종목(키움 upName). 업종마다 5개 */
export const useIndustries = (board: 'KOSPI' | 'KOSDAQ') =>
  useQuery({ queryKey: ['market', 'industries', board], queryFn: () => api<IndustryListing>(`/market/industries?board=${board}&limit=5`), staleTime: 30 * 60_000 });
