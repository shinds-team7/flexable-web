// 금융 가이드 글별 조회수(GET /guide-contents/views)와 열람 기록(POST /guide-contents/{id}/views).
// 방문자 값은 소식 열람 집계와 같은 브라우저 임의 UUID다. 계정과 연결하지 않고 서버도 30일 뒤 지운다.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { paths } from '@/lib/api-schema';
import { viewerId } from '@/data/newsHot';

type GuideViewsResponse = paths['/guide-contents/views']['get']['responses'][200]['content']['application/json'];

export type GuideViewMap = Record<string, number>;

/** 글을 열었다고 서버에 알린다. 실패해도 화면은 그대로이고 다시 보내지 않는다 */
export function recordGuideView(contentId: string) {
  const viewer = viewerId();
  if (!viewer) return;
  api(`/guide-contents/${encodeURIComponent(contentId)}/views`, { method: 'POST', json: { viewerId: viewer }, keepalive: true }).catch(() => {});
}

// 서버에 닿지 못하면 null: 화면은 조회수 숫자를 숨기고, 조회순은 모두 같은 조회수로 보고 정렬한다
async function fetchViews(): Promise<GuideViewMap | null> {
  try {
    const { items } = await api<GuideViewsResponse>('/guide-contents/views');
    return Object.fromEntries(items.map((i) => [i.id, i.views]));
  } catch {
    return null;
  }
}

export const useGuideViews = (): GuideViewMap | null => useQuery({ queryKey: ['guide', 'views'], queryFn: fetchViews, staleTime: 60_000 }).data ?? null;
