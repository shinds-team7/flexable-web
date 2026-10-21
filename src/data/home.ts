// 홈 화면 데이터. 시드머니는 웹 백엔드(GET /api/v1/me/seed-money)의 앱 연동 값을 쓰고, 연동 전·체험·앱 서버를 부르는 배포(Vercel)는
// 예시 값(시연 페르소나 '지수')을 돌려준다. 지수·소식은 아직 예시다. isSample=true면 화면이 "예시" 표시를 붙인다.
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import type { SeedPoint } from '@/charts/SeedLineChart';
import { api } from '@/lib/api';
import type { SeedEntry } from './appLink';

export type SeedMoney = {
  confirmed: number; // 확정 시드머니(앱: 모아둔 돈 + 반영한 돈)
  current: number | null; // 이번 주기 남기는 중(확정 전). 앱이 보내지 않아 연동 값에서는 null
  todaySaved: number | null; // 오늘 아낀 돈(표시 전용). 연동 값에서는 null
  manual: number | null; // 직접 입력한 값(있으면 우선)
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
  sync: { status: 'fresh' | 'stale'; syncedAt: string } | null;
};

export type MarketIndex = { code: 'KOSPI' | 'KOSDAQ'; name: string; value: number; change: number; changeRate: number };
export type MarketIndices = { asOf: string; source: string; items: MarketIndex[]; isSample: boolean };

export type NewsItem = { id: string; cat: string; title: string; save: string; dday: number | null };

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

const months = [74000, 81000, 78000, 79000, 80000, 78000];
const history: SeedPoint[] = [];
months.reduce((cum, v, i) => {
  const d = new Date(2026, 3 + i, 25);
  history.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-25`, saved: v, cum: cum + v });
  return cum + v;
}, 0);

const SAMPLE: SeedMoney = {
  confirmed: 470000,
  current: 120000,
  todaySaved: 3000,
  manual: null,
  asOf: '2026-10-17',
  avgPerCycle: 78000,
  history,
  isSample: true,
  stale: false,
};

/** 웹 백엔드(같은 출처 /api)를 쓰는 배포인지. 앱 서버를 부르는 배포(Vercel)에는 이 API가 없다. */
const usesWebBackend = !import.meta.env.VITE_API_URL;

// 직접 수정 저장(PUT·DELETE /me/seed-money/manual)은 아직 없다. 연동하지 않았거나 금액이 없으면 예시를 보여 준다.
async function fetchSeedMoney(member: boolean): Promise<SeedMoney> {
  if (!member || !usesWebBackend) return delay(SAMPLE);
  const r = await api<SeedMoneyResponse>('/me/seed-money');
  if (r.source !== 'app' || r.status !== 'available' || r.total == null) return SAMPLE;
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

// TODO(BE·콘텐츠): 승인된 청년 금융 소식 API
async function fetchNews(): Promise<NewsItem[]> {
  return delay([
    { id: 'n3', cat: '생활·문화', title: '청년 문화 이용권 하반기 접수', save: '공연·전시에 연 최대 10만 원', dday: 2 },
    { id: 'n1', cat: '교통', title: '기후동행카드 만료에 따른 K-패스 페이백 강화', save: '대중교통비를 돌려받는 폭이 커져요', dday: 3 },
    { id: 'n2', cat: '주거', title: '○○시 청년 월세 지원 2차 신청', save: '월 최대 20만 원 · 12개월', dday: 5 },
  ]);
}

export function useSeedMoney() {
  const { status } = useSession();
  const member = status === 'member';
  return useQuery({ queryKey: ['seed-money', member], queryFn: () => fetchSeedMoney(member) });
}
export const useIndices = () => useQuery({ queryKey: ['market', 'indices'], queryFn: fetchIndices, staleTime: 5 * 60_000 });
export const useHomeNews = () => useQuery({ queryKey: ['news', 'home'], queryFn: fetchNews });
