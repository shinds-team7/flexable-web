// 회색 박스: 분야 칩 · 검색 · 지역 · 나이대. 박스 아래 줄: 진행중(지금 신청 가능) · 정렬. 모든 조건은 서로 독립이고 동시에 적용된다.
import { AGE_BANDS, NEWS_CATEGORIES, REGIONS } from '@/data/news';
import type { NewsFilter } from '@/lib/newsList';

type Props = { value: NewsFilter; onChange: (patch: Partial<NewsFilter>) => void };

const CATS = [{ id: 'ALL', label: '전체' } as const, ...NEWS_CATEGORIES];
const SORTS = [
  { id: 'deadline', label: '마감 임박순' },
  { id: 'new', label: '새로운 순' },
] as const;

export function NewsFilters({ value: f, onChange }: Props) {
  return (
    <div className="news-filters" role="search" aria-label="소식 거르기">
      <div className="chips" role="group" aria-label="분야">
        {CATS.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={f.category === c.id} onClick={() => onChange({ category: c.id })}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="toolbar news-fields">
        <label className="news-field news-search">
          <span className="news-field-k">검색</span>
          <input
            className="input"
            type="search"
            placeholder="어떤 청년 정책을 찾고 있나요?"
            value={f.query}
            onChange={(e) => onChange({ query: e.target.value })}
          />
        </label>
        <label className="news-field">
          <span className="news-field-k">지역</span>
          <select className="input news-select" value={f.region} onChange={(e) => onChange({ region: e.target.value as NewsFilter['region'] })}>
            <option value="ALL">전체</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="news-field">
          <span className="news-field-k">나이</span>
          <select className="input news-select" value={f.age} onChange={(e) => onChange({ age: e.target.value as NewsFilter['age'] })}>
            <option value="ALL">전연령</option>
            {AGE_BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/** 필터 박스 아래 줄 오른쪽: 진행중 · 정렬. 왼쪽 개수 표시는 화면(News)이 둔다. */
export function NewsSortBar({ value: f, onChange }: Props) {
  return (
    <div className="news-sortbar">
      <label className="check">
        <input type="checkbox" checked={f.openOnly} onChange={(e) => onChange({ openOnly: e.target.checked })} />
        진행중
      </label>
      <span className="news-sortbar-div" aria-hidden="true" />
      <div className="news-sort" role="group" aria-label="정렬">
        {SORTS.map((s) => (
          <button key={s.id} type="button" aria-pressed={f.sort === s.id} onClick={() => onChange({ sort: s.id })}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
