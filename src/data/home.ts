// 홈 화면 데이터. 시드머니는 웹 백엔드(GET /api/v1/me/seed-money)의 앱 연동 값과 직접 고친 값(manual)을 쓴다. 비로그인 체험은 예시 값이다.
// 지수는 아직 예시다(#89 GET /market/indices가 생기면 바꾼다). isSample=true면 화면이 "예시" 표시를 붙인다. 소식은 data/news.ts.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import type { SeedPoint } from '@/charts/SeedLineChart';
import { api } from '@/lib/api';
import { refreshAppLink, type SeedEntry } from './appLink';

export type SeedMoney = {
  confirmed: number; // 확정 시드머니(앱: 모아둔 돈 + 반영한 돈)
  current: number | null; // 이번 주기 남기는 중(확정 전). 앱이 보내지 않아 연동 값에서는 null
  todaySaved: number | null; // 오늘 아낀 돈(표시 전용). 연동 값에서는 null
  manual: number | null; // 직접 고친 값(있으면 앱 값보다 우선). 회원은 서버에 저장, 비로그인 체험은 이 탭에서만
  asOf: string; // 기준 시각(앱이 마지막으로 확정한 시각)
  avgPerCycle: number; // 저축 속도. 연동 값은 앱의 매달 저축할 돈(03 §3-4)
  history: SeedPoint[];
  isSample: boolean;
  /** 앱 서버 조회 실패로 syncedAt 기준 값 */
  stale: boolean;
};

/** GET /api/v1/me/seed-money(backend/README.md "API") */
type SeedMoneyResponse = {
  source: 'app' | 'none';
  status: 'available' | 'budget_not_set' | 'not_received' | null;
  total: number | null;
  base: number | null;
  monthlyGoal: number | null;
  startedOn: string | null;
  updatedAt: string | null;
  entries: SeedEntry[] | null;
  sync: { status: 'fresh' | 'stale'; syncedAt: string; due: boolean } | null;
  manual: { total: number; updatedAt: string } | null;
};

export type MarketIndex = { code: 'KOSPI' | 'KOSDAQ'; name: string; value: number; change: number; changeRate: number };
export type MarketIndices = { asOf: string; source: string; items: MarketIndex[]; isSample: boolean };

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

// 연동 전 기본값은 0원이다. 앱을 연동하면 앱 값을 불러오고, 직접 고친 금액이 있으면 그 값이 우선한다.
const EMPTY: SeedMoney = {
  confirmed: 0,
  current: null,
  todaySaved: null,
  manual: null,
  asOf: '',
  avgPerCycle: 0,
  history: [],
  isSample: false,
  stale: false,
};

// 게스트(로그인 없이 체험) 기본 시드머니. 예시 값이라 화면에 "예시" 표시가 붙는다.
const GUEST: SeedMoney = { ...EMPTY, confirmed: 4_270_000, isSample: true };

// 서버에 저장하지 않는 직접 고친 금액: 비로그인 체험과 웹 백엔드가 없는 배포(Vercel)만. 이 탭의 메모리에 두고 새로고침하면 사라진다.
let localManual: number | null = null;

/** 웹 백엔드(같은 출처 /api)를 쓰는 배포인지. 앱 서버를 부르는 배포(Vercel)에는 이 API가 없다. */
const usesWebBackend = !import.meta.env.VITE_API_URL;

/** 직접 고친 값을 서버에 저장하는지(로그인 회원 + 웹 백엔드). */
const savesOnServer = (member: boolean) => member && usesWebBackend;

async function fetchSeedMoney(member: boolean): Promise<SeedMoney> {
  if (!member) return delay({ ...GUEST, manual: localManual });
  if (!usesWebBackend) return delay({ ...EMPTY, manual: localManual });
  let r = await api<SeedMoneyResponse>('/me/seed-money');
  // GET은 저장한 값만 준다. 다시 받을 때가 됐으면 앱 서버에서 받아 온 뒤 다시 읽는다(실패하면 저장한 값 그대로).
  if (r.sync?.due && (await refreshAppLink())) r = await api<SeedMoneyResponse>('/me/seed-money');
  return { ...fromApp(r), manual: r.manual?.total ?? null };
}

function fromApp(r: SeedMoneyResponse): SeedMoney {
  if (r.source !== 'app' || r.status !== 'available' || r.total == null) return EMPTY;
  // 그래프: (시작일, 모아둔 돈) 다음에 (주기 종료일, 반영 후 합계). 누적은 앱이 준 값 그대로 쓴다.
  const points: SeedPoint[] = (r.entries ?? []).map((e) => ({ date: e.cycleEnd, saved: e.amount, cum: e.totalAfter }));
  if (r.startedOn && r.base != null && (points.length === 0 || r.startedOn < points[0].date)) {
    points.unshift({ date: r.startedOn, saved: null, cum: r.base });
  }
  return {
    confirmed: r.total,
    current: null,
    todaySaved: null,
    manual: null,
    asOf: (r.updatedAt ?? r.sync?.syncedAt ?? '').slice(0, 10),
    avgPerCycle: r.monthlyGoal ?? 0,
    history: points,
    isSample: false,
    stale: r.sync?.status === 'stale',
  };
}

// TODO(BE·DATA): 지수 시세 API. 공공데이터포털 금융위 지수시세정보는 일 단위(전 거래일 종가)라 "현재"가 아니라 기준일 종가로 표시한다.
async function fetchIndices(): Promise<MarketIndices> {
  return delay({
    asOf: '2026-10-16',
    source: '금융위원회 지수시세정보(공공데이터포털)',
    isSample: true,
    items: [
      { code: 'KOSPI', name: '코스피', value: 3612.48, change: 21.35, changeRate: 0.0059 },
      { code: 'KOSDAQ', name: '코스닥', value: 872.16, change: -4.02, changeRate: -0.0046 },
    ],
  });
}

export function useSeedMoney() {
  const { status } = useSession();
  const member = status === 'member';
  return useQuery({ queryKey: ['seed-money', member], queryFn: () => fetchSeedMoney(member) });
}

/**
 * 시드머니 직접 고치기(null이면 앱 기록 기준으로 되돌림). 로그인 회원은 PUT·DELETE /api/v1/me/seed-money/manual로 저장하고,
 * 비로그인 체험은 이 탭에서만 바꾼다. 저장이 끝나면 상단 칩·홈·투자 화면이 같은 값을 쓴다. saved: 서버에 저장했는지.
 */
export function useSetSeedManual() {
  const qc = useQueryClient();
  const member = useSession().status === 'member';
  return async (n: number | null): Promise<{ saved: boolean }> => {
    const saved = savesOnServer(member);
    if (saved) {
      if (n == null) await api<void>('/me/seed-money/manual', { method: 'DELETE' });
      else await api<SeedMoneyResponse>('/me/seed-money/manual', { method: 'PUT', json: { total: n } });
    } else {
      localManual = n;
    }
    qc.setQueriesData<SeedMoney>({ queryKey: ['seed-money', member] }, (old) => (old ? { ...old, manual: n } : old));
    if (saved) void qc.invalidateQueries({ queryKey: ['seed-money', member] });
    return { saved };
  };
}
export const useIndices = () => useQuery({ queryKey: ['market', 'indices'], queryFn: fetchIndices, staleTime: 5 * 60_000 });
