// 홈 화면 데이터. 지금은 서버 API가 없어 예시 값(시연 페르소나 '지수')을 돌려준다.
// API가 생기면 각 fetch 함수 안만 바꾼다. 화면 코드는 그대로 둔다. isSample=true면 화면이 "예시" 표시를 붙인다.
import { useQuery } from '@tanstack/react-query';
import type { SeedPoint } from '@/charts/SeedLineChart';

export type SeedMoney = {
  confirmed: number; // 끝난 정산 주기 누적(확정)
  current: number; // 이번 주기 남기는 중(확정 전)
  todaySaved: number; // 오늘 아낀 돈(표시 전용)
  manual: number | null; // 직접 입력한 값(있으면 우선)
  asOf: string; // 앱 기록 기준일
  avgPerCycle: number;
  history: SeedPoint[];
  isSample: boolean;
};

export type MarketIndex = { code: 'KOSPI' | 'KOSDAQ'; name: string; value: number; change: number; changeRate: number };
export type MarketIndices = { asOf: string; source: string; items: MarketIndex[]; isSample: boolean };

export type NewsItem = { id: string; cat: string; title: string; save: string; dday: number | null };

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

const months = [74000, 81000, 78000, 79000, 80000, 78000];
const history: SeedPoint[] = [];
months.reduce((cum, v, i) => {
  const d = new Date(2026, 3 + i, 1);
  history.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, saved: v, cum: cum + v });
  return cum + v;
}, 0);

// TODO(BE): GET /api/v1/me/seed-money (docs/product/03-architecture.md C-1), 수정은 PUT·DELETE /me/seed-money/manual
async function fetchSeedMoney(): Promise<SeedMoney> {
  return delay({ confirmed: 470000, current: 120000, todaySaved: 3000, manual: null, asOf: '2026-10-17', avgPerCycle: 78000, history, isSample: true });
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

export const useSeedMoney = () => useQuery({ queryKey: ['seed-money'], queryFn: fetchSeedMoney });
export const useIndices = () => useQuery({ queryKey: ['market', 'indices'], queryFn: fetchIndices, staleTime: 5 * 60_000 });
export const useHomeNews = () => useQuery({ queryKey: ['news', 'home'], queryFn: fetchNews });
