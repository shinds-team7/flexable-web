// 요즘 많이 본 지원금(GET /youth-news/hot)과 열람 집계(POST /youth-news/{id}/views).
// 방문자 값은 이 브라우저가 처음 한 번 만들어 localStorage(fx.news.viewer)에 두는 임의 UUID다. 계정과 연결하지 않고 서버도 30일 뒤 지운다.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type HotNews = { basis: 'SITE'; windowDays: number; items: { newsId: string; visitors: number }[] };

const VIEWER_KEY = 'fx.news.viewer';

function viewerId(): string | null {
  try {
    let id = localStorage.getItem(VIEWER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VIEWER_KEY, id);
    }
    return id;
  } catch {
    return null; // 저장할 수 없는 환경이면 세지 않는다
  }
}

/** 소식을 열었다고 서버에 알린다. 실패해도 화면은 그대로이고 다시 보내지 않는다. 예시 소식은 세지 않는다. */
export function recordNewsView(newsId: string) {
  const viewer = viewerId();
  if (!viewer) return;
  api(`/youth-news/${encodeURIComponent(newsId)}/views`, { method: 'POST', json: { viewerId: viewer }, keepalive: true }).catch(() => {});
}

// 서버에 닿지 못하면 빈 집계로 보고 화면이 마감 임박 순으로 채운다.
async function fetchHot(): Promise<HotNews> {
  try {
    return await api<HotNews>('/youth-news/hot');
  } catch {
    return { basis: 'SITE', windowDays: 7, items: [] };
  }
}

export const useHotNews = () => useQuery({ queryKey: ['news', 'hot'], queryFn: fetchHot, staleTime: 60_000 });
