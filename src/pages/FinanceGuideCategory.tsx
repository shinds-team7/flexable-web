// 금융 가이드 카테고리 화면(/guide/basic · /guide/product). 메인(/guide)의 카테고리 카드에서 들어온다.
// 경로 표시 · 제목 → 꼭 알아야 하는 지식(고정 추천 가이드) → 전체 콘텐츠(검색 · 최신순/많이 본 순 · 콘텐츠 카드).
// 상세 글은 따로 들어올 예정이라 카드의 '더보기'는 아직 준비 중이다(누를 수 없음). 주소의 #id로 들어오면 그 카드로 내려가 잠깐 강조한다.
// 검색어는 화면 메모리에만 두고 저장·전송하지 않는다.
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { FinanceArt } from '@/components/guide/GuideArt';
import {
  CATEGORY_LABEL,
  contentMatches,
  GUIDE_CATEGORIES,
  GUIDE_CONTENTS,
  isGuideCategory,
  selectContents,
  SORT_LABEL,
  type ContentSort,
  type GuideCategory,
  type GuideContent,
} from '@/data/financeGuide';
import '@/styles/finance-guide.css';

export default function FinanceGuideCategory() {
  const { category } = useParams();
  if (!isGuideCategory(category)) return <Navigate to="/guide" replace />;
  return <CategoryPage key={category} category={category} />;
}

function CategoryPage({ category }: { category: GuideCategory }) {
  const label = CATEGORY_LABEL[category];
  const meta = GUIDE_CATEGORIES.find((c) => c.id === category);
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ContentSort>('latest');
  const [focusId, setFocusId] = useState<string | null>(null);

  const all = useMemo(() => GUIDE_CONTENTS.items.filter((c) => c.category === category), [category]);
  const pinned = all.filter((c) => c.pinned);
  const list = selectContents(all, category, sort).filter((c) => contentMatches(c, query));

  // 주소의 #id로 들어오면(메인의 콘텐츠 카드 등) 그 카드로 내려가 잠깐 강조한다
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id || !all.some((c) => c.id === id)) return;
    setQuery('');
    setFocusId(id);
    const raf = requestAnimationFrame(() => document.getElementById(`fin-c-${id}`)?.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const t = setTimeout(() => setFocusId(null), 2400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [location.hash, all]);

  return (
    <section>
      <div className="page fin fin-catpage">
        <div className="fin-cat-top">
          <nav className="fin-crumb" aria-label="현재 위치">
            <Link to="/guide">금융 가이드</Link>
            <ChevronIcon />
            <span aria-current="page">{label}</span>
          </nav>
          <h1>{label}</h1>
          {meta && <p>{meta.lead}</p>}
        </div>

        <section className="fin-sec" aria-labelledby="fin-pinned">
          <div className="fin-pinned-head">
            <h2 id="fin-pinned">꼭 알아야 하는 지식</h2>
            <span className="fin-rec-badge">
              <SparkIcon />
              추천 가이드
            </span>
          </div>
          <ul className="fin-pinned">
            {pinned.map((c) => (
              <li key={c.id} className="fin-pin-card">
                <span className="fin-pin-art">
                  <FinanceArt id={c.art} />
                </span>
                <b>{c.title}</b>
                <span className="fin-pin-desc">{c.desc}</span>
                <span className="fin-tag">#{c.tag}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="fin-sec" aria-labelledby="fin-all">
          <h2 id="fin-all">전체 {label} 콘텐츠</h2>
          <div className="fin-list-tools">
            <form className="fin-search fin-search-sm" role="search" onSubmit={(e) => e.preventDefault()}>
              <SearchIcon />
              <label htmlFor="fin-cq" className="sr-only">
                {label} 콘텐츠 검색
              </label>
              <input
                id="fin-cq"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="궁금한 금융 지식을 검색해 보세요."
                autoComplete="off"
                maxLength={40}
              />
            </form>
            <label className="fin-sort-pill">
              <span className="sr-only">정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as ContentSort)}>
                {(Object.keys(SORT_LABEL) as ContentSort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
              <ChevronDownIcon />
            </label>
          </div>

          {list.length === 0 ? (
            <div className="fin-list-empty">
              <p>‘{query.trim()}’에 맞는 콘텐츠가 아직 없어요.</p>
              <button type="button" className="btn btn-text" onClick={() => setQuery('')}>
                검색 지우기
              </button>
            </div>
          ) : (
            <ul className="fin-cards">
              {list.map((c) => (
                <ContentCard key={c.id} c={c} label={label} focused={focusId === c.id} />
              ))}
            </ul>
          )}
          {GUIDE_CONTENTS.isSample && <p className="fin-list-foot">많이 본 순과 최신순은 예시 값으로 정렬해요. 콘텐츠 상세는 준비 중이에요.</p>}
        </section>
      </div>
    </section>
  );
}

/** 콘텐츠 카드: 분류 · 제목 · 설명 · 태그 · 더보기(상세 준비 중이라 누를 수 없음) */
function ContentCard({ c, label, focused }: { c: GuideContent; label: string; focused: boolean }) {
  return (
    <li id={`fin-c-${c.id}`} className={`fin-card${focused ? ' focused' : ''}`}>
      <span className="fin-card-label">{label}</span>
      <h3>{c.title}</h3>
      <p>{c.desc}</p>
      <span className="fin-tag">#{c.tag}</span>
      <span className="fin-card-more" aria-disabled="true">
        더보기 <span className="fin-card-soon">준비 중</span>
      </span>
    </li>
  );
}

const SearchIcon = () => (
  <svg className="fin-search-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="fin-crumb-sep" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="fin-chev-down" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M3.5 6L8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SparkIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M8 1.5l1.6 4.9L14.5 8l-4.9 1.6L8 14.5 6.4 9.6 1.5 8l4.9-1.6z" fill="currentColor" />
  </svg>
);
