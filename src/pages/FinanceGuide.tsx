// 금융 가이드(/guide). 상단 메뉴 '금융정보'(/finance)와는 다른 화면. AI 계획에서 예적금·주식·ETF 등을 고르기 전에, 처음 쓰는 사람에게 개념을 안내한다.
// 경로 표시·제목·검색(GuideSearch, 검색해도 화면을 스크롤하지 않음) → 검색 결과(용어 설명) → 카테고리 카드 → 추천 콘텐츠(정렬) → AI 목표 달성 안내 띠.
// 카테고리 카드는 카테고리 화면(/guide/:category)으로, 콘텐츠 카드·검색 결과는 콘텐츠 상세(/guide/:category/:id)로 간다. 검색어는 브라우저 메모리에만 있고 저장·전송하지 않는다.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TargetArt, TopicArt } from '@/components/guide/GuideArt';
import { GuideCat, GuideMeta, GuideThumb } from '@/components/guide/GuideMeta';
import { GuideSearchBox, GuideSearchResults, useGuideSearch } from '@/components/guide/GuideSearch';
import {
  CATEGORY_LABEL,
  GUIDE_CATEGORIES,
  GUIDE_CONTENTS,
  MAIN_SORT,
  selectContents,
  RECOMMENDED,
  selectRecommended,
  type MainSort,
} from '@/data/financeGuide';
import { useGuideViews } from '@/data/guideViews';
import '@/styles/finance-guide.css';

export default function FinanceGuide() {
  const { input, query, run, onInput } = useGuideSearch();

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
          <GuideSearchBox value={input} onInput={onInput} onSearch={run} placeholder="궁금한 금융 용어나 개념을 검색해보세요. (예: 금리, CMA, ETF)" />
        </header>

        {query && <GuideSearchResults query={query} onClear={() => run('')} />}

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

        <Contents />

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

/** 추천 콘텐츠: 추천순(기본)·최신순·조회순 정렬, 4열 카드 8개. 분류 표시 색은 위 카테고리 카드와 맞춘다. 분야별로 보려면 위 카테고리 카드로 간다 */
const MAIN_CONTENT_COUNT = 8;
function Contents() {
  const [sort, setSort] = useState<MainSort>('recommended');
  const views = useGuideViews();
  const all = GUIDE_CONTENTS.items;
  const items = (sort === 'recommended' ? selectRecommended(all, 'all') : selectContents(all, 'all', sort, views ?? {}, RECOMMENDED.all)).slice(0, MAIN_CONTENT_COUNT);
  return (
    <section className="fin-sec fin-contents" aria-labelledby="fin-contents">
      <div className="fin-contents-top">
        <div className="fin-contents-head">
          <h2 id="fin-contents">추천 콘텐츠</h2>
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
              <GuideThumb c={c} className="fin-content-thumb" />
              <GuideCat c={c} />
              <b>{c.title}</b>
              <span className="fin-content-desc">{c.desc}</span>
              <GuideMeta minutes={c.minutes} views={views ? (views[c.id] ?? 0) : undefined} />
            </Link>
          </li>
        ))}
      </ul>
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

const ArrowIcon = () => (
  <svg className="fin-arrow" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <path d="M4 10h11M10.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
