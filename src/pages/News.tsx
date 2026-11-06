// 청년 금융 소식(/news). 설계: 02-design.md §5-7, 와이어프레임 「청년 돈 소식」.
// 검색창 → [내 지원금 찾기 · 요즘 핫한 청년 소식] → 지원금 분석(파란 카드 + 입력 요령 글) → 조건으로 찾기 → 소식 목록(3열, 전체 너비).
// 목록은 아래로 내리면 이어서 불러오는 무한 스크롤이고, 오른쪽 아래 버튼으로 맨 위로 올라간다.
// 저장한 소식은 마이페이지(/mypage)에서 본다.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { InsightCard, GuideCard } from '@/components/news/NewsAnalysis';
import { NewsFinder, type FinderTab } from '@/components/news/NewsDiagnosis';
import { NewsCard, NewsCardSkeleton } from '@/components/news/NewsCard';
import { NewsHero } from '@/components/news/NewsHero';
import { NewsSearch } from '@/components/news/NewsSearch';
import { FindMine, HotNewsCard } from '@/components/news/NewsQuick';
import { useNews, type YouthNews } from '@/data/news';
import { useHotNews } from '@/data/newsHot';
import { readNewsFilter, useSavedNews, writeNewsFilter } from '@/data/newsSaved';
import { todayKst } from '@/lib/deadline';
import { monthInsight, pickHot } from '@/lib/newsInsight';
import {
  conditionCount,
  DEFAULT_FILTER,
  EMPTY_CONDITIONS,
  NEWS_PAGE_SIZE,
  selectNews,
  type NewsConditions,
  type NewsFilter,
  type NewsSort,
} from '@/lib/newsList';

const SORTS: { id: NewsSort; label: string }[] = [
  { id: 'new', label: '새로운 순' },
  { id: 'deadline', label: '마감 임박순' },
];

export default function News() {
  const news = useNews();
  const hot = useHotNews();
  const { isSaved, toggle } = useSavedNews();
  const [filter, setFilter] = useState<NewsFilter>(readNewsFilter);
  // 조건으로 찾기: draft는 칩을 누르는 대로 바뀌고, [검색하기]를 눌러야 applied로 옮겨져 목록에 반영된다
  const [draft, setDraft] = useState<NewsConditions>(EMPTY_CONDITIONS);
  const [applied, setApplied] = useState<NewsConditions>(EMPTY_CONDITIONS);
  const [finderTab, setFinderTab] = useState<FinderTab>('COND');
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
  const list = useMemo(() => selectNews(items, filter, today, applied), [items, filter, today, applied]);
  const insight = useMemo(() => monthInsight(items, today), [items, today]);
  const picks = useMemo(() => pickHot(items, hot.data, today), [items, hot.data, today]);

  // 목록은 NEWS_PAGE_SIZE개씩 이어서 보여 준다. 조건·검색·정렬을 바꾸면 처음부터 다시 쌓는다
  const [visible, setVisible] = useState(NEWS_PAGE_SIZE);
  const shown = list.slice(0, visible);
  const hasMore = visible < list.length;
  const resultsTop = useRef<HTMLHeadingElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setVisible(NEWS_PAGE_SIZE), [filter, applied]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setVisible((v) => v + NEWS_PAGE_SIZE), { rootMargin: '0px 0px 400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visible]);
  const goResults = () => resultsTop.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const openFinder = (tab: FinderTab) => {
    setFinderTab(tab);
    setTimeout(() => document.getElementById('news-conditions')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const search = (query: string) => {
    setFilter((f) => ({ ...f, query }));
    goResults();
  };
  const searchConditions = () => {
    setApplied(draft);
    goResults();
  };
  const goDeadline = () => {
    setFilter((f) => ({ ...f, sort: 'deadline' }));
    goResults();
  };
  const clear = () => {
    setDraft(EMPTY_CONDITIONS);
    setApplied(EMPTY_CONDITIONS);
    setFilter((f) => ({ ...DEFAULT_FILTER, sort: f.sort }));
  };
  const filtered = conditionCount(applied) > 0 || filter.query.trim() !== '';

  const onToggleSave = (n: YouthNews) => setToast(toggle(n) ? '저장했어요. 마이페이지에서 볼 수 있어요' : '저장을 뺐어요');

  return (
    <section className="news-screen">
      <NewsHero onGoConditions={() => openFinder('MATCH')} />
      <div className="news-band">
        <div className="page news-page">
          <div className="news-quick">
            <FindMine onGoConditions={() => openFinder('COND')} onGoDeadline={goDeadline} />
            <HotNewsCard picks={picks} hot={hot.data} today={today} isSample={isSample} />
          </div>

          <section className="news-sec" aria-labelledby="news-analysis-title">
            <h2 id="news-analysis-title" className="news-sec-title">
              지원금 분석
            </h2>
            <div className="news-analysis">
              <InsightCard insight={insight} isSample={isSample} />
              <GuideCard />
            </div>
          </section>

          <NewsFinder
            tab={finderTab}
            onTab={setFinderTab}
            conditions={{ value: draft, onChange: setDraft, onSearch: searchConditions }}
            items={items}
            today={today}
            renderCard={(n) => <NewsCard n={n} today={today} isSample={isSample} saved={isSaved(n.id)} onToggleSave={() => onToggleSave(n)} onToast={setToast} />}
          />

          <section aria-labelledby="news-all-title" className="news-sec">
            <h2 id="news-all-title" className="news-sec-title" ref={resultsTop}>
              {conditionCount(applied) > 0 ? '조건에 맞는 소식' : '전체 소식'}
            </h2>
            <NewsSearch query={filter.query} onSearch={search} />
            <div className="news-count">
              <div className="news-count-l" aria-live="polite">
                {news.isSuccess && (
                  <p className="meta">
                    소식 <b className="num">{list.length}</b>개
                    {filter.query.trim() && <> · 검색어 “{filter.query.trim()}”</>}
                  </p>
                )}
                {filtered && (
                  <button type="button" className="btn btn-text" onClick={clear}>
                    조건 지우기
                  </button>
                )}
              </div>
              <div className="news-sortbar">
                <div className="news-sort" role="group" aria-label="정렬">
                  {SORTS.map((s) => (
                    <button key={s.id} type="button" aria-pressed={filter.sort === s.id} onClick={() => setFilter((f) => ({ ...f, sort: s.id }))}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
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
                <p className="sub">다른 지역이나 주제를 더 골라 보세요.</p>
                <button type="button" className="btn btn-line" onClick={clear}>
                  조건 지우기
                </button>
              </div>
            ) : (
              <>
                <div className="news-grid news-list">
                  {shown.map((n) => (
                    <NewsCard key={n.id} n={n} today={today} isSample={isSample} saved={isSaved(n.id)} onToggleSave={() => onToggleSave(n)} onToast={setToast} />
                  ))}
                </div>
                {hasMore && (
                  <div ref={sentinel} className="news-more" role="status" aria-label="소식을 더 불러오는 중">
                    <span className="dots-spinner" aria-hidden="true">
                      {Array.from({ length: 8 }, (_, i) => (
                        <i key={i} style={{ '--i': i } as CSSProperties} />
                      ))}
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
      {/* 알림 영역은 늘 두고 안의 글자만 바꾼다. 새로 끼워 넣은 role=status는 일부 스크린리더가 읽지 않는다 */}
      <div role="status">{toast && <div className="toast">{toast}</div>}</div>
    </section>
  );
}
