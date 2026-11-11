// 금융 가이드 카테고리 화면(/guide/basic · /guide/product). 메인(/guide)의 카테고리 카드에서 들어온다.
// 경로 표시 · 제목 · 설명 → 검색과 정렬(추천순 기본 · 최신순 · 조회순) → 분류 칩(저축과 투자만: 전체 · 저축 · 투자) → 콘텐츠 목록.
// 검색창은 메인과 같은 GuideSearchBox(자동완성, 이 카테고리 글만)이고, 엔터로 검색하면 목록이 맞는 글만 남는다. 없으면 '검색 결과가 없습니다.'
// 목록 한 줄은 왼쪽에 글 표지 이미지, 오른쪽에 제목 · 설명 · 읽는 시간/조회수(GuideMeta)이고 줄 전체가 상세 화면(/guide/:category/:id) 링크다.
// 주소의 #id로 들어오면 그 줄로 내려가 잠깐 강조한다. 검색어는 화면 메모리에만 두고 저장·전송하지 않는다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { GuideCat, GuideMeta, GuideThumb } from '@/components/guide/GuideMeta';
import { GuideSearchBox, useGuideSearch } from '@/components/guide/GuideSearch';
import {
  CATEGORY_LABEL,
  GUIDE_CATEGORIES,
  GUIDE_CONTENTS,
  isGuideCategory,
  MAIN_SORT,
  RECOMMENDED,
  searchGuide,
  selectContents,
  selectRecommendedFirst,
  TOPIC_LABEL,
  type GuideCategory,
  type GuideContent,
  type GuideTopic,
  type MainSort,
} from '@/data/financeGuide';
import { useGuideViews } from '@/data/guideViews';
import '@/styles/finance-guide.css';

/** 정렬 선택지 순서(라벨은 메인과 같은 MAIN_SORT) */
const SORTS: MainSort[] = ['recommended', 'latest', 'popular'];

export default function FinanceGuideCategory() {
  const { category } = useParams();
  if (!isGuideCategory(category)) return <Navigate to="/guide" replace />;
  return <CategoryPage key={category} category={category} />;
}

function CategoryPage({ category }: { category: GuideCategory }) {
  const label = CATEGORY_LABEL[category];
  const meta = GUIDE_CATEGORIES.find((c) => c.id === category);
  const location = useLocation();
  const { input, query, run, onInput } = useGuideSearch();
  const [topic, setTopic] = useState<GuideTopic | 'all'>('all');
  const [sort, setSort] = useState<MainSort>('recommended');
  const [focusId, setFocusId] = useState<string | null>(null);

  const all = useMemo(() => GUIDE_CONTENTS.items.filter((c) => c.category === category), [category]);
  const topics = (Object.keys(TOPIC_LABEL) as GuideTopic[]).filter((t) => all.some((c) => c.topic === t));
  const views = useGuideViews();
  // 엔터로 검색하면 검색어에 맞는 이 카테고리 글만 남긴다(입력 중에는 목록을 바꾸지 않는다). 검색창을 비우면 다시 전체
  const matched = useMemo(() => (query ? new Set(searchGuide(query, category).contents.map((c) => c.id)) : null), [query, category]);
  const shown = all.filter((c) => (topic === 'all' || c.topic === topic) && (!matched || matched.has(c.id)));
  const recommended = category === 'basic' ? RECOMMENDED.basic : topic === 'all' ? [...RECOMMENDED.saving, ...RECOMMENDED.investing] : RECOMMENDED[topic];
  const list = sort === 'recommended' ? selectRecommendedFirst(shown, recommended) : selectContents(shown, category, sort, views ?? {}, recommended);

  // 검색 중에는 목록 영역을 검색 전 높이로 유지한다. 목록이 줄어 페이지가 짧아지면 브라우저가 스크롤 위치를 끌어올리거나
  // 세로 스크롤바가 사라져 화면이 옆으로 밀리기 때문이다. 높이는 검색하지 않을 때(창 크기·분류·정렬이 바뀔 때 포함)만 잰다
  const listRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(0);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (query || !el) return;
    setListHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setListHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [query]);

  // 주소의 #id로 들어오면(메인의 콘텐츠 카드 등) 그 줄로 내려가 잠깐 강조한다
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id || !all.some((c) => c.id === id)) return;
    setTopic('all');
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
            <Link to="/guide" className="fin-crumb-guide">
              <HomeIcon />
              금융 가이드
            </Link>
            <ChevronIcon />
            <span aria-current="page">{label}</span>
          </nav>
          <h1>{label}</h1>
          {meta && <p>{meta.lead}</p>}
        </div>

        <section className="fin-sec" aria-label={`${label} 콘텐츠`}>
          <div className="fin-list-tools">
            <GuideSearchBox value={input} onInput={onInput} onSearch={run} category={category} placeholder="궁금한 금융 지식을 검색해 보세요." className="fin-search-sm" />
            <label className="fin-sort-pill">
              <span className="sr-only">정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as MainSort)}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {MAIN_SORT[s].label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon />
            </label>
          </div>

          {topics.length > 0 && (
            <div className="fin-chips" role="group" aria-label="분류">
              {(['all', ...topics] as const).map((t) => (
                <button key={t} type="button" className="fin-chip" aria-pressed={topic === t} onClick={() => setTopic(t)}>
                  {t === 'all' ? '전체' : TOPIC_LABEL[t]}
                </button>
              ))}
            </div>
          )}

          <div ref={listRef} style={query && listHeight ? { minHeight: listHeight } : undefined}>
            {list.length === 0 ? (
              <p className="fin-list-none">검색 결과가 없습니다.</p>
            ) : (
              <ul className="fin-rows">
                {list.map((c) => (
                  <ContentRow key={c.id} c={c} views={views ? (views[c.id] ?? 0) : undefined} focused={focusId === c.id} />
                ))}
              </ul>
            )}
          </div>
          {GUIDE_CONTENTS.isSample && sort === 'latest' && <p className="fin-list-foot">최신순은 예시 값으로 정렬해요.</p>}
        </section>
      </div>
    </section>
  );
}

/** 목록 한 줄: 표지 | 분류(금융 기초 · 저축 · 투자, 메인 카드와 같은 색 구분) · 제목 · 설명 · 읽는 시간/조회수. 표지가 없는 글은 카드 그림(art)으로 채운다 */
function ContentRow({ c, views, focused }: { c: GuideContent; views?: number; focused: boolean }) {
  return (
    <li>
      <Link id={`fin-c-${c.id}`} to={`/guide/${c.category}/${c.id}`} className={`fin-row${focused ? ' focused' : ''}`}>
        <GuideThumb c={c} className="fin-row-thumb" />
        <div className="fin-row-text">
          <GuideCat c={c} />
          <h3>{c.title}</h3>
          <p className="fin-row-desc">{c.desc}</p>
          <GuideMeta minutes={c.minutes} views={views} />
        </div>
      </Link>
    </li>
  );
}

const HomeIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M2.5 7.2L8 2.5l5.5 4.7V13a.5.5 0 0 1-.5.5H9.8V10H6.2v3.5H3a.5.5 0 0 1-.5-.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
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
