// 소식 목록 거르기·정렬·오늘의 한 장 고르기. 화면과 분리한 순수 함수라 서버 쿼리로 옮기기 쉽다.
// '추천' 정렬은 두지 않는다(01-product.md §7). 정렬은 사용자가 고른 기준(마감 임박순·새로운 순)만.
import { AGE_BANDS, newsCategories, type AgeBandId, type NewsCategory, type RegionName, type YouthNews } from '@/data/news';
import { daysBetween, deadlineState, type ApplyPeriod } from './deadline';

export type NewsSort = 'deadline' | 'new';
export type NewsFilter = {
  category: NewsCategory | 'ALL';
  region: RegionName | 'ALL';
  age: AgeBandId | 'ALL';
  sort: NewsSort;
  query: string;
};

export const DEFAULT_FILTER: NewsFilter = { category: 'ALL', region: 'ALL', age: 'ALL', sort: 'deadline', query: '' };

export const isDefaultFilter = (f: NewsFilter) =>
  f.category === 'ALL' && f.region === 'ALL' && f.age === 'ALL' && f.query.trim() === '';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

function matchesQuery(n: YouthNews, q: string) {
  const k = norm(q);
  if (!k) return true;
  return [n.title, n.summary, n.audience.summary, n.source.org, ...(n.keywords ?? [])].some((s) => s != null && norm(s).includes(k));
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
function deadlineKey(n: ApplyPeriod, today: string) {
  if (n.alwaysOpen) return 1e6;
  if (!n.applyDeadline) return 2e6;
  return daysBetween(today, n.applyDeadline);
}

/** 저장함 정렬 키: 목록과 같은 마감 임박순, 마감된 소식은 맨 아래 */
export const savedDeadlineKey = (p: ApplyPeriod, today: string) => (deadlineState(p, today).kind === 'closed' ? 3e6 : deadlineKey(p, today));

const postedKey = (n: YouthNews, today: string) => (n.postedAt ? daysBetween(today, n.postedAt) : -Infinity);

/** 마감된 소식은 목록에서 내린다(저장함에만 '마감됨'으로 남는다, 02-design.md §5-7). */
export function selectNews(items: YouthNews[], f: NewsFilter, today: string): YouthNews[] {
  const list = items.filter((n) => {
    const s = deadlineState(n, today);
    if (s.kind === 'closed') return false;
    if (f.category !== 'ALL' && !newsCategories(n).includes(f.category)) return false;
    return matchesRegion(n, f.region) && matchesAge(n, f.age) && matchesQuery(n, f.query);
  });
  const byPosted = (a: YouthNews, b: YouthNews) => postedKey(b, today) - postedKey(a, today);
  return list.sort(f.sort === 'deadline' ? (a, b) => deadlineKey(a, today) - deadlineKey(b, today) || byPosted(a, b) : byPosted);
}

/** 목록 한 페이지에 보여 줄 소식 수 */
export const NEWS_PAGE_SIZE = 12;

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE));

/** 페이지 번호 줄: 첫·끝 페이지와 지금 페이지 앞뒤 2개. 건너뛴 자리는 null(…) */
export function pageWindow(current: number, total: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - current) <= 2) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
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

/** 카드 아래 정보 칩(분야 칩은 카드가 따로 앞에 둔다): 지역 · 나이 · 소득 기준(원문에 있을 때만) · 기관. */
export const cardTags = (n: YouthNews) => [regionText(n), ageText(n), ...(n.audience.incomeLimit ? ['소득 기준 있음'] : []), n.source.org];

const dotDate = (iso: string) => iso.replaceAll('-', '.');

/** 카드 기간 줄: "2026.10.01 - 2026.10.24" / "상시 모집" / "~ 2026.10.24" / "2026.10.24 시작 · 마감일 미정" / "공고문 확인" */
export function periodText(n: Pick<YouthNews, 'applyStart' | 'applyDeadline' | 'alwaysOpen'>) {
  if (n.alwaysOpen) return '상시 모집';
  if (n.applyStart && n.applyDeadline) return `${dotDate(n.applyStart)} - ${dotDate(n.applyDeadline)}`;
  if (n.applyDeadline) return `~ ${dotDate(n.applyDeadline)}`;
  if (n.applyStart) return `${dotDate(n.applyStart)} 시작 · 마감일 미정`;
  return '공고문 확인';
}
