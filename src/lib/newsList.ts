// 소식 목록 거르기·정렬·오늘의 한 장 고르기. 화면과 분리한 순수 함수라 서버 쿼리로 옮기기 쉽다.
// '추천' 정렬은 두지 않는다(01-product.md §7). 정렬은 사용자가 고른 기준(마감 임박순·새로운 순)만.
import { AGE_BANDS, type AgeBandId, type NewsCategory, type RegionName, type YouthNews } from '@/data/news';
import { canApplyNow, daysBetween, deadlineState } from './deadline';

export type NewsSort = 'deadline' | 'new';
export type NewsFilter = {
  category: NewsCategory | 'ALL';
  region: RegionName | 'ALL';
  age: AgeBandId | 'ALL';
  openOnly: boolean;
  sort: NewsSort;
  query: string;
};

export const DEFAULT_FILTER: NewsFilter = { category: 'ALL', region: 'ALL', age: 'ALL', openOnly: false, sort: 'deadline', query: '' };

export const isDefaultFilter = (f: NewsFilter) =>
  f.category === 'ALL' && f.region === 'ALL' && f.age === 'ALL' && !f.openOnly && f.query.trim() === '';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

function matchesQuery(n: YouthNews, q: string) {
  const k = norm(q);
  if (!k) return true;
  return [n.title, n.benefit, n.audience.summary, n.source.org, ...(n.keywords ?? [])].some((s) => norm(s).includes(k));
}

const matchesRegion = (n: YouthNews, r: NewsFilter['region']) => r === 'ALL' || n.regions === 'NATIONWIDE' || n.regions.includes(r);

// 나이 조건을 원문에서 확인하지 못한 소식은 숨기지 않는다(카드에 "공고문 확인"으로 표시).
function matchesAge(n: YouthNews, a: NewsFilter['age']) {
  const band = AGE_BANDS.find((b) => b.id === a);
  if (!band) return true;
  const { ageMin, ageMax } = n.audience;
  if (ageMin == null && ageMax == null) return true;
  return (ageMin ?? 0) <= band.max && (ageMax ?? Infinity) >= band.min;
}

/** 마감 임박순 키. 마감일 있는 것 → 상시 → 마감일 미정 순 */
function deadlineKey(n: YouthNews, today: string) {
  if (n.alwaysOpen) return 1e6;
  if (!n.applyDeadline) return 2e6;
  return daysBetween(today, n.applyDeadline);
}

const postedKey = (n: YouthNews, today: string) => (n.postedAt ? daysBetween(today, n.postedAt) : -Infinity);

/** 마감된 소식은 목록에서 내린다(저장함에만 '마감됨'으로 남는다, 02-design.md §5-7). */
export function selectNews(items: YouthNews[], f: NewsFilter, today: string): YouthNews[] {
  const list = items.filter((n) => {
    const s = deadlineState(n, today);
    if (s.kind === 'closed') return false;
    if (f.openOnly && !canApplyNow(s)) return false;
    if (f.category !== 'ALL' && n.category !== f.category) return false;
    return matchesRegion(n, f.region) && matchesAge(n, f.age) && matchesQuery(n, f.query);
  });
  const byPosted = (a: YouthNews, b: YouthNews) => postedKey(b, today) - postedKey(a, today);
  return list.sort(f.sort === 'deadline' ? (a, b) => deadlineKey(a, today) - deadlineKey(b, today) || byPosted(a, b) : byPosted);
}

/** 오늘의 한 장(편집자 지정 MAIN 1개). 화면에서 점수로 고르지 않는다. 마감됐으면 보여 주지 않는다. */
export const pickMain = (items: YouthNews[], today: string) =>
  items.find((n) => n.slot === 'MAIN' && deadlineState(n, today).kind !== 'closed') ?? null;

export const regionText = (n: YouthNews) => (n.regions === 'NATIONWIDE' ? '전국' : n.regions.join('·'));

/** 신청 가능 나이. 원문에서 확인 못 했으면 조건이 없다고 쓰지 않는다. */
export function ageText({ audience: { ageMin, ageMax } }: YouthNews) {
  if (ageMin != null && ageMax != null) return `만 ${ageMin}~${ageMax}세`;
  if (ageMin != null) return `만 ${ageMin}세 이상`;
  if (ageMax != null) return `만 ${ageMax}세 이하`;
  return '나이 조건 공고문 확인';
}

/** 카드 조건 한 줄: "만 19~34세 / 소득 기준 있음". 소득 기준은 원문에 있을 때만 붙인다. */
export const conditionText = (n: YouthNews) => (n.audience.incomeLimit ? `${ageText(n)} / 소득 기준 있음` : ageText(n));
