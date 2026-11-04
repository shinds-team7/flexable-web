// 금융 가이드(/guide). 상단 메뉴 '금융정보'(/finance)와는 다른 화면. AI 계획에서 예적금·주식·ETF 등을 고르기 전에, 처음 쓰는 사람에게 개념을 안내한다.
// 검색 배너 → 검색 결과(용어 설명) → 카테고리 → 추천 콘텐츠(탭·정렬) → AI 목표 달성 안내 띠.
// 카테고리 카드는 카테고리 화면(/guide/:category)으로, 콘텐츠 카드는 그 콘텐츠를 펼친 카테고리 화면(#id)으로 간다. 검색어·저장 표시는 브라우저 메모리에만 있고 저장·전송하지 않는다.
import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { FinanceArt, FinanceHeroArt, TargetArt } from '@/components/guide/GuideArt';
import {
  CATEGORY_LABEL,
  GLOSSARY,
  GUIDE_CATEGORIES,
  GUIDE_CONTENTS,
  searchGuide,
  selectContents,
  SORT_LABEL,
  SUGGESTED_KEYWORDS,
  type ContentSort,
  type GuideCategory,
} from '@/data/financeGuide';
import { won } from '@/lib/format';
import '@/styles/finance-guide.css';

type Tab = GuideCategory | 'all';

export default function FinanceGuide() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const resultsRef = useRef<HTMLElement>(null);
  const [scrollResults, setScrollResults] = useState(false);

  const run = (q: string) => {
    setInput(q);
    setQuery(q.trim());
    if (q.trim()) setScrollResults(true);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(input);
  };
  // 검색 결과가 화면에서 잘 안 보이면 결과로 내려간다(이미 보이면 움직이지 않는다)
  useEffect(() => {
    if (!scrollResults) return;
    setScrollResults(false);
    const el = resultsRef.current;
    const r = el?.getBoundingClientRect();
    if (el && r && (r.top < 0 || r.top > window.innerHeight * 0.6)) el.scrollIntoView({ block: 'start' });
  }, [scrollResults, query]);

  return (
    <section>
      <div className="page fin">
        <header className="fin-hero">
          <div className="fin-hero-text">
            <h1>궁금한 금융 지식을 검색해보세요</h1>
            <p>금융 기초부터 상품까지, 필요한 정보를 쉽게 찾아볼 수 있어요.</p>
            <form className="fin-search" role="search" onSubmit={onSubmit}>
              <SearchIcon />
              <label htmlFor="fin-q" className="sr-only">
                금융 지식 검색
              </label>
              <input
                id="fin-q"
                type="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="궁금한 금융 지식을 검색해 보세요!"
                autoComplete="off"
                maxLength={40}
              />
              <button type="submit" className="fin-search-btn" aria-label="검색">
                <ArrowIcon />
              </button>
            </form>
            <div className="fin-keywords">
              <span>추천 검색어</span>
              <ul>
                {SUGGESTED_KEYWORDS.map((k) => (
                  <li key={k}>
                    <button type="button" className="fin-kw" aria-pressed={query === k} onClick={() => run(k)}>
                      {k}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <FinanceHeroArt />
        </header>

        {query && <SearchResults ref={resultsRef} query={query} onClear={() => run('')} />}

        <section className="fin-sec" aria-labelledby="fin-cats">
          <div className="fin-sec-head">
            <h2 id="fin-cats">카테고리</h2>
            <p>관심 있는 주제를 선택해 보세요.</p>
          </div>
          <ul className="fin-cats">
            {GUIDE_CATEGORIES.map((c) => (
              <li key={c.id}>
                <Link to={`/guide/${c.id}`} className="fin-cat-card">
                  <span className="fin-cat-art">
                    <FinanceArt id={c.art} />
                  </span>
                  <span className="fin-cat-body">
                    <b>{CATEGORY_LABEL[c.id]}</b>
                    {c.desc.map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </span>
                  <span className="fin-round-arrow" aria-hidden="true">
                    <ArrowIcon />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Contents tab={tab} onTab={setTab} />

        <section className="fin-cta" aria-labelledby="fin-cta">
          <TargetArt />
          <div className="fin-cta-body">
            <h2 id="fin-cta">내 목표에 맞는 금융 계획이 궁금하다면?</h2>
            <p>목표 금액과 기한을 입력하면 적금·CMA·ETF·주식 조합마다 매달 얼마를 넣어야 하는지 AI와 비교해 볼 수 있어요.</p>
          </div>
          <Link to="/goal" className="btn btn-primary fin-cta-btn">
            AI 목표 달성 시작하기 <ArrowIcon />
          </Link>
        </section>
      </div>
    </section>
  );
}

/** 추천 콘텐츠: 전체·금융 기초·금융 상품 탭, 최신순·많이 본 순 정렬, 3열 카드 최대 6개. 저장 표시는 이 화면을 보는 동안만 유지된다 */
const MAIN_CONTENT_COUNT = 6;
function Contents({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const [sort, setSort] = useState<ContentSort>('latest');
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const items = selectContents(GUIDE_CONTENTS.items, tab, sort).slice(0, MAIN_CONTENT_COUNT);
  const toggle = (id: string) =>
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const tabs: Tab[] = ['all', 'basic', 'product'];
  return (
    <section className="fin-sec fin-contents" aria-labelledby="fin-contents">
      <div className="fin-contents-head">
        <h2 id="fin-contents">추천 콘텐츠</h2>
        <div className="fin-tabs" role="group" aria-label="카테고리">
          {tabs.map((t) => (
            <button key={t} type="button" className="fin-tab" aria-pressed={tab === t} onClick={() => onTab(t)}>
              {t === 'all' ? '전체' : CATEGORY_LABEL[t]}
            </button>
          ))}
        </div>
        <label className="fin-sort">
          <span className="sr-only">정렬</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as ContentSort)}>
            {(Object.keys(SORT_LABEL) as ContentSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="fin-grid">
        {items.map((c) => (
          <li key={c.id} className="fin-content">
            <Link to={`/guide/${c.category}#${c.id}`} className="fin-content-main">
              <span className="fin-content-art">
                <FinanceArt id={c.art} />
              </span>
              <span className="fin-content-body">
                <span className="fin-cat">{CATEGORY_LABEL[c.category]}</span>
                <b>{c.title}</b>
                <span className="fin-content-desc">{c.desc}</span>
                <span className="fin-meta">
                  <span>
                    <ClockIcon />약 {c.minutes}분
                  </span>
                  <span>
                    <EyeIcon />
                    <span className="num">{won(c.views)}</span>
                    {GUIDE_CONTENTS.isSample && <span className="tag-ex">예시</span>}
                  </span>
                </span>
              </span>
            </Link>
            <button type="button" className="fin-save" aria-pressed={saved.has(c.id)} aria-label={`${c.title} 저장`} onClick={() => toggle(c.id)}>
              <BookmarkIcon filled={saved.has(c.id)} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 검색 결과: 용어 설명 → 관련 콘텐츠 */
function SearchResults({ ref, query, onClear }: { ref: Ref<HTMLElement>; query: string; onClear: () => void }) {
  const r = searchGuide(query);
  const count = r.terms.length + r.contents.length;
  return (
    <section ref={ref} className="card fin-results" aria-labelledby="fin-results" aria-live="polite">
      <div className="fin-results-head">
        <h2 id="fin-results">
          ‘{query}’ 검색 결과 <span className="num">{count}</span>건
        </h2>
        <button type="button" className="btn btn-text" onClick={onClear}>
          검색 지우기
        </button>
      </div>
      {count === 0 ? (
        <p className="fin-results-empty">
          아직 이 화면에 없는 내용이에요. {GLOSSARY.slice(0, 6).map((g) => g.term).join(', ')} 같은 기본 용어로 찾아보세요.
        </p>
      ) : (
        <>
          {r.terms.length > 0 && (
            <ul className="fin-terms">
              {r.terms.map((t) => (
                <li key={t.term} className="fin-term">
                  <h3>{t.term}</h3>
                  <p>{t.desc}</p>
                  {t.note && <p className="fin-term-note">{t.note}</p>}
                </li>
              ))}
            </ul>
          )}
          {r.contents.length > 0 && (
            <div className="fin-results-group">
              <h3>관련 콘텐츠</h3>
              <ul>
                {r.contents.map((c) => (
                  <li key={c.id}>
                    <span className="fin-cat">{CATEGORY_LABEL[c.category]}</span>
                    <Link to={`/guide/${c.category}#${c.id}`} className="fin-results-link">
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <p className="fin-results-foot">일반적인 상품 구조를 설명한 내용이에요. 실제 조건은 상품마다 다르니 가입 전에 금융회사 안내를 확인하세요.</p>
    </section>
  );
}

const SearchIcon = () => (
  <svg className="fin-search-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ArrowIcon = () => (
  <svg className="fin-arrow" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d="M4 10h11M10.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.5V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
);

const BookmarkIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M4 2.5h8v11L8 10.8 4 13.5z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);
