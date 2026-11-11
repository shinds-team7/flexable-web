// 금융 가이드 글별 조회수(GET /guide-contents/views)와 열람 기록(POST /guide-contents/{id}/views).
// 방문자 값은 소식 열람 집계와 같은 브라우저 임의 UUID다. 계정과 연결하지 않고 서버도 30일 뒤 지운다.
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { paths } from '@/lib/api-schema';
import { viewerId } from '@/data/newsHot';

type GuideViewsResponse = paths['/guide-contents/views']['get']['responses'][200]['content']['application/json'];

export type GuideViewMap = Record<string, number>;

const VIEWS_KEY = ['guide', 'views'] as const;

/** 글을 열었다고 서버에 알리는 함수를 돌려준다. 센 뒤에는 조회수 목록을 다시 받아, 목록으로 돌아오면 바로 보이게 한다. 실패해도 화면은 그대로이고 다시 보내지 않는다 */
export function useRecordGuideView() {
  const qc = useQueryClient();
  return useCallback(
    (contentId: string) => {
      const viewer = viewerId();
      if (!viewer) return;
      api(`/guide-contents/${encodeURIComponent(contentId)}/views`, { method: 'POST', json: { viewerId: viewer }, keepalive: true })
        .then(() => qc.invalidateQueries({ queryKey: VIEWS_KEY }))
        .catch(() => {});
    },
    [qc],
  );
}

// 서버에 닿지 못하면 null: 화면은 조회수 숫자를 숨기고, 조회순은 모두 같은 조회수로 보고 정렬한다.
// 서버 응답의 1분 캐시(Cache-Control)를 브라우저가 그대로 쓰면 방금 센 값이 안 보여서, 받을 때마다 서버에 다시 묻는다
async function fetchViews(): Promise<GuideViewMap | null> {
  try {
    const { items } = await api<GuideViewsResponse>('/guide-contents/views', { cache: 'no-cache' });
    return Object.fromEntries(items.map((i) => [i.id, i.views]));
  } catch {
    return null;
  }
}

export const useGuideViews = (): GuideViewMap | null => useQuery({ queryKey: VIEWS_KEY, queryFn: fetchViews, staleTime: 60_000 }).data ?? null;
