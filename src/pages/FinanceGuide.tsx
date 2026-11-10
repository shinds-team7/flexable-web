// 금융 가이드(/guide). 상단 메뉴 '금융정보'(/finance)와는 다른 화면. AI 계획에서 예적금·주식·ETF 등을 고르기 전에, 처음 쓰는 사람에게 개념을 안내한다.
// 경로 표시·제목·검색 → 검색 결과(용어 설명) → 카테고리 카드 → 추천 콘텐츠(탭·정렬) → AI 목표 달성 안내 띠.
// 카테고리 카드는 카테고리 화면(/guide/:category)으로, 콘텐츠 카드·검색 결과는 콘텐츠 상세(/guide/:category/:id)로 간다. 검색어는 브라우저 메모리에만 있고 저장·전송하지 않는다.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TargetArt, TopicArt } from '@/components/guide/GuideArt';
import {
  CATEGORY_LABEL,
  GLOSSARY,
  GUIDE_CATEGORIES,
  GUIDE_CONTENTS,
  MAIN_SORT,
  searchGuide,
  selectContents,
  RECOMMENDED,
  selectRecommended,
  suggestGuide,
  TOPIC_LABEL,
  type GuideContent,
  type GuideSuggestion,
  type GuideTopic,
  type MainSort,
} from '@/data/financeGuide';
import { useGuideViews } from '@/data/guideViews';
import { won } from '@/lib/format';
import '@/styles/finance-guide.css';

type Tab = 'all' | GuideTopic | 'basic';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'basic', label: CATEGORY_LABEL.basic },
  { id: 'saving', label: TOPIC_LABEL.saving },
  { id: 'investing', label: TOPIC_LABEL.investing },
];

const inTab = (c: GuideContent, tab: Tab) => tab === 'all' || (tab === 'basic' ? c.category === 'basic' : c.topic === tab);

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
  // 검색어를 다 지우면 결과도 바로 사라진다
  const onInput = (v: string) => {
    setInput(v);
    if (!v.trim()) setQuery('');
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
        <header className="fin-head">
          <nav className="fin-crumb" aria-label="현재 위치">
            <Link to="/home" className="fin-crumb-home" aria-label="홈">
              <HomeIcon />
            </Link>
            <ChevronIcon />
            <span aria-current="page">금융 가이드</span>
          </nav>
          <h1>금융 가이드</h1>
          <p>저축부터 투자까지, 꼭 알아야 할 금융 지식을 쉽고 정리된 콘텐츠로 확인해보세요.</p>
          <SearchBox value={input} onInput={onInput} onSearch={run} />
        </header>

        {query && <SearchResults ref={resultsRef} query={query} onClear={() => run('')} />}

        <section className="fin-sec" aria-labelledby="fin-topics">
          <div className="fin-sec-head">
            <h2 id="fin-topics">주제별 가이드</h2>
          </div>
          <ul className="fin-topics">
            {GUIDE_CATEGORIES.map((c) => (
              <li key={c.id}>
                <Link to={`/guide/${c.id}`} className={`fin-topic fin-topic-${c.id}`}>
                  <span className="fin-topic-body">
                    <b>{CATEGORY_LABEL[c.id]}</b>
                    {c.desc.map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </span>
                  <TopicArt id={c.id} />
                  <ChevronIcon />
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

/** 검색창과 자동완성 목록. 용어를 고르면 이 화면에서 검색하고, 글을 고르면 콘텐츠 상세로 간다 */
function SearchBox({ value, onInput, onSearch }: { value: string; onInput: (v: string) => void; onSearch: (q: string) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = open ? suggestGuide(value) : [];

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const choose = (o: GuideSuggestion) => {
    close();
    if (o.kind === 'term') onSearch(o.label);
    else navigate(`/guide/${o.content.category}/${o.content.id}`);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (options[active]) return choose(options[active]);
    close();
    onSearch(value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!options.length) return;
    // 목록이 열려 있으면 Esc는 목록만 닫는다(검색창 기본 동작은 입력을 지운다)
    if (e.key === 'Escape') {
      e.preventDefault();
      return close();
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    setActive((i) => (i + step + options.length + (i < 0 && step < 0 ? 1 : 0)) % options.length);
  };

  return (
    <form className="fin-search fin-search-wide" role="search" onSubmit={onSubmit}>
      <SearchIcon />
      <label htmlFor="fin-q" className="sr-only">
        금융 지식 검색
      </label>
      <input
        id="fin-q"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
        aria-controls="fin-suggest"
        aria-activedescendant={options[active] ? `fin-suggest-${active}` : undefined}
        value={value}
        onChange={(e) => {
          onInput(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
        placeholder="궁금한 금융 용어나 개념을 검색해보세요. (예: 금리, CMA, ETF)"
        autoComplete="off"
        maxLength={40}
      />
      {options.length > 0 && (
        <ul id="fin-suggest" className="fin-suggest" role="listbox" aria-label="검색어 자동완성">
          {options.map((o, i) => (
            <li
              key={`${o.kind}-${o.label}`}
              id={`fin-suggest-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
            >
              <span className="fin-suggest-label">{o.label}</span>
              <span className="fin-suggest-kind">{o.kind === 'term' ? '용어' : '가이드'}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** 추천 콘텐츠: 전체·금융 기초·저축·투자 탭, 추천순(기본)·최신순·조회순 정렬, 4열 카드로 전체 탭은 8개, 나머지 탭은 4개까지. 분류 표시 색은 위 카테고리 카드와 맞춘다 */
const contentCount = (tab: Tab) => (tab === 'all' ? 8 : 4);
function Contents({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const [sort, setSort] = useState<MainSort>('recommended');
  const views = useGuideViews();
  const filtered = GUIDE_CONTENTS.items.filter((c) => inTab(c, tab));
  const items = (sort === 'recommended' ? selectRecommended(filtered, tab) : selectContents(filtered, 'all', sort, views ?? {}, RECOMMENDED[tab])).slice(0, contentCount(tab));
  return (
    <section className="fin-sec fin-contents" aria-labelledby="fin-contents">
      <div className="fin-contents-top">
        <div className="fin-contents-head">
          <h2 id="fin-contents">추천 콘텐츠</h2>
          <div className="fin-tabs" role="group" aria-label="카테고리">
            {TABS.map((t) => (
              <button key={t.id} type="button" className="fin-tab" aria-pressed={tab === t.id} onClick={() => onTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="fin-contents-sub">
          <p className="fin-contents-lead">{MAIN_SORT[sort].lead}</p>
          <label className="fin-sort">
            <span className="sr-only">정렬</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as MainSort)}>
              {(Object.keys(MAIN_SORT) as MainSort[]).map((s) => (
                <option key={s} value={s}>
                  {MAIN_SORT[s].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <ul className="fin-grid">
        {items.map((c) => (
          <li key={c.id}>
            <Link to={`/guide/${c.category}/${c.id}`} className="fin-content-main">
              <span className={`fin-cat fin-cat-${c.category}`}>{c.topic ? TOPIC_LABEL[c.topic] : CATEGORY_LABEL[c.category]}</span>
              <b>{c.title}</b>
              <span className="fin-content-desc">{c.desc}</span>
              <span className="fin-meta">
                <span>
                  <ClockIcon />약 {c.minutes}분
                </span>
                {views && (
                  <span>
                    <EyeIcon />
                    <span className="num">{won(views[c.id] ?? 0)}</span>
                  </span>
                )}
              </span>
            </Link>
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
                    <Link to={`/guide/${c.category}/${c.id}`} className="fin-results-link">
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

const EyeIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.5V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
