// 소식 화면의 분석·핫 카드 계산. 서버 값(소식 목록·열람 집계)을 모아 세기만 하고 새 값을 만들지 않는다. 화면과 분리한 순수 함수.
import { categoryLabel, newsCategories, type NewsCategory, type YouthNews } from '@/data/news';
import type { HotNews } from '@/data/newsHot';
import { daysBetween, deadlineState } from './deadline';

export type MonthInsight = {
  month: number;
  /** 지금 신청할 수 있는 소식: 상시 모집 + 마감일이 확인되고 아직 지나지 않은 소식. 마감된 소식과 마감일을 모르는 소식은 뺀다 */
  total: number;
  /** 분야별 건수(많은 순, 전 분야). 소식 하나가 여러 분야에 들면 각각 센다 */
  categories: { id: NewsCategory; label: string; count: number }[];
  topRegion: { name: string; count: number } | null;
  /** 이번 달에 신청이 시작되는 소식 */
  starts: number;
  /** 이번 달에 신청이 마감되는 소식 */
  deadlines: number;
  /** 상시 모집 소식 */
  always: number;
};

const inMonth = (iso: string | null | undefined, ym: string) => !!iso && iso.startsWith(ym);

export function monthInsight(items: YouthNews[], today: string): MonthInsight {
  const ym = today.slice(0, 7);
  const set = items.filter((n) => {
    const k = deadlineState(n, today).kind;
    return k === 'always' || (k !== 'closed' && k !== 'unknown' && !!n.applyDeadline);
  });

  const cat = new Map<NewsCategory, number>();
  const region = new Map<string, number>();
  for (const n of set) {
    for (const c of newsCategories(n)) cat.set(c, (cat.get(c) ?? 0) + 1);
    if (n.regions !== 'NATIONWIDE') for (const r of n.regions) region.set(r, (region.get(r) ?? 0) + 1);
  }
  const top = [...region.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))[0];
  return {
    month: Number(ym.slice(5)),
    total: set.length,
    categories: [...cat.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: categoryLabel(id), count })),
    topRegion: top ? { name: top[0], count: top[1] } : null,
    starts: set.filter((n) => inMonth(n.applyStart, ym)).length,
    deadlines: set.filter((n) => !n.alwaysOpen && inMonth(n.applyDeadline, ym)).length,
    always: set.filter((n) => n.alwaysOpen).length,
  };
}

export type HotPick = { n: YouthNews; visitors: number | null };

/**
 * 요즘 핫한 청년 소식 count개. 서버가 센 최근 7일 방문자 수 순으로 앞에서 채우고(마감된 소식 제외),
 * 모자라면 마감이 가까운 소식(visitors=null)으로 채운다. 구글 검색량은 쓰지 않는다(공식 API·키 없음).
 */
export function pickHot(items: YouthNews[], hot: HotNews | undefined, today: string, count = 3): HotPick[] {
  const byId = new Map(items.map((n) => [n.id, n]));
  const out: HotPick[] = [];
  for (const h of hot?.items ?? []) {
    const n = byId.get(h.newsId);
    if (n && deadlineState(n, today).kind !== 'closed') out.push({ n, visitors: h.visitors });
    if (out.length === count) return out;
  }
  const used = new Set(out.map((p) => p.n.id));
  const soon = items
    .filter((n) => !used.has(n.id) && n.applyDeadline && !n.alwaysOpen && deadlineState(n, today).kind !== 'closed')
    .sort((a, b) => daysBetween(today, a.applyDeadline!) - daysBetween(today, b.applyDeadline!));
  for (const n of soon.slice(0, count - out.length)) out.push({ n, visitors: null });
  return out;
}
