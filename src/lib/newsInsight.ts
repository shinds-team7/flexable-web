// 소식 화면의 분석·핫 카드 계산. 서버 값(소식 목록·열람 집계)을 모아 세기만 하고 새 값을 만들지 않는다. 화면과 분리한 순수 함수.
import { categoryLabel, newsCategories, type NewsCategory, type YouthNews } from '@/data/news';
import type { HotNews } from '@/data/newsHot';
import { daysBetween, deadlineState } from './deadline';

export type MonthInsight = {
  /** 'month' = 이번 달에 올라온 소식, 'open' = 이번 달 올라온 소식이 없어 지금 열린 소식 전체 */
  basis: 'month' | 'open';
  month: number;
  total: number;
  /** 분야별 건수(많은 순, 최대 5). 소식 하나가 여러 분야에 들면 각각 센다 */
  categories: { id: NewsCategory; label: string; count: number }[];
  topRegion: { name: string; count: number } | null;
  starts: number;
  deadlines: number;
  /** 신청 시작·마감이 모두 있는 소식의 신청 기간 가운데 값(일). 없으면 null */
  medianDays: number | null;
};

const inMonth = (iso: string | null | undefined, ym: string) => !!iso && iso.startsWith(ym);

export function monthInsight(items: YouthNews[], today: string): MonthInsight {
  const ym = today.slice(0, 7);
  const open = items.filter((n) => deadlineState(n, today).kind !== 'closed');
  const posted = open.filter((n) => inMonth(n.postedAt, ym));
  const basis = posted.length > 0 ? 'month' : 'open';
  const set = basis === 'month' ? posted : open;

  const cat = new Map<NewsCategory, number>();
  const region = new Map<string, number>();
  for (const n of set) {
    for (const c of newsCategories(n)) cat.set(c, (cat.get(c) ?? 0) + 1);
    if (n.regions !== 'NATIONWIDE') for (const r of n.regions) region.set(r, (region.get(r) ?? 0) + 1);
  }
  const top = [...region.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))[0];
  const spans = set
    .filter((n) => n.applyStart && n.applyDeadline)
    .map((n) => daysBetween(n.applyStart!, n.applyDeadline!) + 1)
    .sort((a, b) => a - b);
  const mid = Math.floor(spans.length / 2);
  return {
    basis,
    month: Number(ym.slice(5)),
    total: set.length,
    categories: [...cat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, label: categoryLabel(id), count })),
    topRegion: top ? { name: top[0], count: top[1] } : null,
    starts: set.filter((n) => inMonth(n.applyStart, ym)).length,
    deadlines: set.filter((n) => inMonth(n.applyDeadline, ym)).length,
    medianDays: spans.length === 0 ? null : spans.length % 2 ? spans[mid] : Math.floor((spans[mid - 1] + spans[mid]) / 2),
  };
}

export type HotPick = { n: YouthNews; visitors: number | null };

/**
 * 요즘 핫한 지원금 count개. 서버가 센 최근 7일 방문자 수 순으로 앞에서 채우고(마감된 소식 제외),
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
