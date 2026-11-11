// 금융 가이드 검색: 검색창(자동완성)은 메인(/guide)과 카테고리 화면(/guide/basic · /guide/product)이 같이 쓰고, 결과 상자는 메인만 쓴다.
// 검색창에 category를 주면 그 카테고리의 글만 자동완성하고 용어 설명은 뺀다. 검색해도 화면을 스크롤하지 않는다.
// 검색어는 브라우저 메모리에만 있고 저장·전송하지 않는다.
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GuideCat } from '@/components/guide/GuideMeta';
import { CATEGORY_LABEL, GLOSSARY, searchGuide, suggestGuide, type GuideCategory, type GuideSuggestion } from '@/data/financeGuide';

/** 검색창 입력값(input)과 실행한 검색어(query). 입력을 다 지우면 결과도 바로 사라진다 */
export function useGuideSearch() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const run = (q: string) => {
    setInput(q);
    setQuery(q.trim());
  };
  const onInput = (v: string) => {
    setInput(v);
    if (!v.trim()) setQuery('');
  };
  return { input, query, run, onInput };
}

/** 검색창과 자동완성 목록. 용어를 고르면 이 화면에서 검색하고, 글을 고르면 콘텐츠 상세로 간다 */
export function GuideSearchBox({
  value,
  onInput,
  onSearch,
  category,
  placeholder,
  className = 'fin-search-wide',
}: {
  value: string;
  onInput: (v: string) => void;
  onSearch: (q: string) => void;
  category?: GuideCategory;
  placeholder: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = open ? suggestGuide(value, 8, category) : [];
  const id = category ? `fin-q-${category}` : 'fin-q';

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
    <form className={`fin-search ${className}`} role="search" onSubmit={onSubmit}>
      <SearchIcon />
      <label htmlFor={id} className="sr-only">
        {category ? `${CATEGORY_LABEL[category]} 콘텐츠 검색` : '금융 지식 검색'}
      </label>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
        aria-controls={`${id}-suggest`}
        aria-activedescendant={options[active] ? `${id}-suggest-${active}` : undefined}
        value={value}
        onChange={(e) => {
          onInput(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={40}
      />
      {options.length > 0 && (
        <ul id={`${id}-suggest`} className="fin-suggest" role="listbox" aria-label="검색어 자동완성">
          {options.map((o, i) => (
            <li
              key={`${o.kind}-${o.label}`}
              id={`${id}-suggest-${i}`}
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

/** 메인 검색 결과: 용어 설명 → 관련 콘텐츠 */
export function GuideSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  const r = searchGuide(query);
  const count = r.terms.length + r.contents.length;
  return (
    <section className="card fin-results" aria-labelledby="fin-results" aria-live="polite">
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
                    <GuideCat c={c} />
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

const SearchIcon = () => (
  <svg className="fin-search-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
