// 저장한 소식과 필터 선택값. 지금은 이 브라우저에만 저장한다.
// TODO(BE): 저장은 로그인 사용자 서버 저장으로 옮긴다(01-product.md F4 [챙기기]). 필터는 계속 브라우저에만 둔다.
import { useCallback, useSyncExternalStore } from 'react';
import { AGE_BANDS, NEWS_CATEGORIES, REGIONS, type YouthNews } from './news';
import { DEFAULT_FILTER, type NewsFilter } from '@/lib/newsList';

const SAVED_KEY = 'fx.news.saved';
const FILTER_KEY = 'fx.news.filter';

/** 목록에서 빠져도(마감·필터) 저장함에 보이도록 카드에 필요한 값만 같이 남긴다. */
// benefit은 10-26 전에 저장한 항목에만 있다(그때 카드 요약 줄). 새로 저장하면 summary를 남긴다.
export type SavedNews = Pick<YouthNews, 'id' | 'title' | 'category' | 'applyStart' | 'applyDeadline' | 'alwaysOpen'> & {
  summary?: string | null;
  benefit?: string | null;
  url: string;
  savedAt: number;
};

let cache: SavedNews[] | null = null;
const listeners = new Set<() => void>();

function readSaved(): SavedNews[] {
  if (cache) return cache;
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    cache = Array.isArray(v) ? v.filter((x): x is SavedNews => typeof x?.id === 'string' && typeof x?.title === 'string') : [];
  } catch {
    cache = [];
  }
  return cache;
}

function writeSaved(next: SavedNews[]) {
  cache = next;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    /* 저장 못 하면 이번 방문에만 유지 */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  // 다른 탭에서 바꾼 것도 반영
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SAVED_KEY) return;
    cache = null;
    l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

const snapshot = (n: YouthNews): SavedNews => ({
  id: n.id,
  title: n.title,
  summary: n.summary,
  category: n.category,
  applyStart: n.applyStart,
  applyDeadline: n.applyDeadline,
  alwaysOpen: n.alwaysOpen,
  url: n.source.url,
  savedAt: Date.now(),
});

export function useSavedNews() {
  const saved = useSyncExternalStore(subscribe, readSaved);
  const isSaved = useCallback((id: string) => saved.some((s) => s.id === id), [saved]);
  /** 저장했으면 true, 뺐으면 false */
  const toggle = useCallback((n: YouthNews) => {
    const cur = readSaved();
    const on = !cur.some((s) => s.id === n.id);
    writeSaved(on ? [snapshot(n), ...cur] : cur.filter((s) => s.id !== n.id));
    return on;
  }, []);
  const remove = useCallback((id: string) => writeSaved(readSaved().filter((s) => s.id !== id)), []);
  return { saved, isSaved, toggle, remove };
}

const oneOf = <T,>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** 검색어는 저장하지 않는다. 목록이 바뀌어 없는 값이 남아 있으면 기본값으로 돌린다. */
export function readNewsFilter(): NewsFilter {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') ?? {};
    return {
      category: oneOf(v.category, ['ALL', ...NEWS_CATEGORIES.map((c) => c.id)], DEFAULT_FILTER.category),
      region: oneOf(v.region, ['ALL', ...REGIONS], DEFAULT_FILTER.region),
      age: oneOf(v.age, ['ALL', ...AGE_BANDS.map((b) => b.id)], DEFAULT_FILTER.age),
      sort: oneOf(v.sort, ['deadline', 'new'] as const, DEFAULT_FILTER.sort),
      query: '',
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

export function writeNewsFilter(f: NewsFilter) {
  try {
    const { query: _q, ...rest } = f;
    localStorage.setItem(FILTER_KEY, JSON.stringify(rest));
  } catch {
    /* 저장 못 해도 화면은 그대로 */
  }
}
