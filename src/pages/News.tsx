// 청년 금융 소식(/news). 설계: 02-design.md §5-7, 와이어프레임 「청년 돈 소식」.
// 제목 · 배너 → [왼쪽] 오늘의 한 장 · 필터 · 소식 목록(3열) / [오른쪽] 저장한 소식. 오늘의 한 장과 저장함은 윗선을 맞춘다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FeaturedNews } from '@/components/news/FeaturedNews';
import { NewsBanner } from '@/components/news/NewsBanner';
import { NewsCard, NewsCardSkeleton } from '@/components/news/NewsCard';
import { NewsFilters, NewsSortBar } from '@/components/news/NewsFilters';
import { SavedNews } from '@/components/news/SavedNews';
import { useNews, type YouthNews } from '@/data/news';
import { readNewsFilter, useSavedNews, writeNewsFilter } from '@/data/newsSaved';
import { todayKst } from '@/lib/deadline';
import { DEFAULT_FILTER, isDefaultFilter, NEWS_PAGE_SIZE, pageCount, pageWindow, pickMain, selectNews, type NewsFilter } from '@/lib/newsList';

/** 화면 위에 붙어 있는 상단 바 높이(.topnav .wrap). 이보다 위로 올라간 영역은 가려져 안 보인다 */
const TOPBAR_HEIGHT = 64;

export default function News() {
  const news = useNews();
  const { saved, isSaved, toggle, remove } = useSavedNews();
  const [filter, setFilter] = useState<NewsFilter>(readNewsFilter);
  const [toast, setToast] = useState<string | null>(null);
  const today = todayKst();

  useEffect(() => writeNewsFilter(filter), [filter]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const items = useMemo(() => news.data?.items ?? [], [news.data]);
  const isSample = news.data?.isSample ?? false;
  const list = useMemo(() => selectNews(items, filter, today), [items, filter, today]);
  const main = useMemo(() => pickMain(items, today), [items, today]);
  // 목록은 한 페이지에 NEWS_PAGE_SIZE개. 필터·정렬을 바꾸면 1페이지로 돌아간다
  const [page, setPage] = useState(1);
  const pages = pageCount(list.length);
  const current = Math.min(page, pages);
  const shown = list.slice((current - 1) * NEWS_PAGE_SIZE, current * NEWS_PAGE_SIZE);
  const listTop = useRef<HTMLHeadingElement>(null);
  useEffect(() => setPage(1), [filter]);
  const goPage = (p: number) => {
    setPage(p);
    listTop.current?.scrollIntoView({ block: 'start' });
  };

  const onToggleSave = (n: YouthNews) => setToast(toggle(n) ? '저장했어요' : '저장을 뺐어요');
  // 검색·필터로 목록이 짧아지면 페이지가 줄어 스크롤이 위로 튄다. 바꾸기 직전 목록 영역 높이를 최소 높이로 붙잡아 둔다(필터 지우기에서 푼다)
  const allRef = useRef<HTMLElement>(null);
  const [holdHeight, setHoldHeight] = useState<number | null>(null);
  const change = (patch: Partial<NewsFilter>) => {
    const h = allRef.current?.offsetHeight;
    if (h) setHoldHeight((prev) => Math.max(prev ?? 0, h));
    // 검색어를 칠 때 필터 박스가 화면에 하나도 안 보이면(스크롤해서 상단 바 위로 지나갔거나 화면 아래에 있으면) 필터 박스로 올린다.
    // 조금이라도 보이면 움직이지 않는다
    if ('query' in patch) {
      const box = allRef.current?.querySelector<HTMLElement>('.news-filters');
      const r = box?.getBoundingClientRect();
      if (box && r && (r.bottom <= TOPBAR_HEIGHT || r.top >= window.innerHeight)) box.scrollIntoView({ block: 'start' });
    }
    setFilter((f) => ({ ...f, ...patch }));
  };
  const clear = () => {
    setHoldHeight(null);
    setFilter((f) => ({ ...DEFAULT_FILTER, sort: f.sort }));
  };

  return (
    <section>
      <div className="page news-page">
        <div className="page-head">
          <div>
            <h1 className="page-title">청년 금융 소식</h1>
            <p className="page-desc">청년에게 필요한 정책과 지원 소식을 한곳에서. 신청 전엔 꼭 공고문을 확인하세요.</p>
          </div>
          {isSample && <span className="tag-ex">아래 소식은 모두 화면 설명용 예시</span>}
        </div>
        <NewsBanner />
        <div className="g84">
          <div className="col">
            {main && <FeaturedNews main={main} today={today} isSample={isSample} saved={isSaved(main.id)} onToggleSave={() => onToggleSave(main)} />}
            <section aria-labelledby="news-all-title" className="col" style={{ gap: 16, minHeight: holdHeight ?? undefined }} ref={allRef}>
              <h2 id="news-all-title" className="sec-title" ref={listTop}>
                전체 소식
              </h2>
              <NewsFilters value={filter} onChange={change} />
              <div className="news-count">
                <div className="news-count-l" aria-live="polite">
                  {news.isSuccess && (
                    <p className="meta">
                      소식 <b className="num">{list.length}</b>개
                    </p>
                  )}
                  {!isDefaultFilter(filter) && (
                    <button type="button" className="btn btn-text" onClick={clear}>
                      필터 지우기
                    </button>
                  )}
                </div>
                <NewsSortBar value={filter} onChange={change} />
              </div>
              {news.isPending ? (
                <div className="news-grid news-list" aria-busy="true" aria-label="소식을 불러오는 중">
                  {Array.from({ length: 6 }, (_, i) => (
                    <NewsCardSkeleton key={i} />
                  ))}
                </div>
              ) : news.isError ? (
                <div className="error-box" role="alert">
                  <h3>소식을 불러오지 못했어요</h3>
                  <button type="button" className="btn btn-primary" onClick={() => news.refetch()}>
                    다시 불러오기
                  </button>
                </div>
              ) : list.length === 0 ? (
                <div className="empty-box news-empty">
                  <h3>조건에 맞는 소식이 없어요</h3>
                  <p className="sub">다른 지역이나 분야로 찾아보세요.</p>
                  <button type="button" className="btn btn-line" onClick={clear}>
                    필터 지우기
                  </button>
                </div>
              ) : (
                <>
                  <div className="news-grid news-list">
                    {shown.map((n) => (
                      <NewsCard key={n.id} n={n} today={today} isSample={isSample} saved={isSaved(n.id)} onToggleSave={() => onToggleSave(n)} onToast={setToast} />
                    ))}
                  </div>
                  {pages > 1 && (
                    <nav className="news-pager" aria-label="소식 페이지">
                      <button type="button" className="btn btn-line btn-sm" disabled={current === 1} onClick={() => goPage(current - 1)}>
                        이전
                      </button>
                      {pageWindow(current, pages).map((p, i) =>
                        p === null ? (
                          <span key={`gap-${i}`} className="news-pager-gap" aria-hidden="true">
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            className="chip num"
                            aria-current={p === current ? 'page' : undefined}
                            aria-pressed={p === current}
                            aria-label={`${p}페이지`}
                            onClick={() => goPage(p)}
                          >
                            {p}
                          </button>
                        ),
                      )}
                      <button type="button" className="btn btn-line btn-sm" disabled={current === pages} onClick={() => goPage(current + 1)}>
                        다음
                      </button>
                    </nav>
                  )}
                </>
              )}
            </section>
          </div>
          <SavedNews saved={saved} items={items} today={today} onRemove={remove} />
        </div>
      </div>
      {/* 알림 영역은 늘 두고 안의 글자만 바꾼다. 새로 끼워 넣은 role=status는 일부 스크린리더가 읽지 않는다 */}
      <div role="status">{toast && <div className="toast">{toast}</div>}</div>
    </section>
  );
}
