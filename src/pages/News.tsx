// 청년 금융 소식(/news). 설계: 02-design.md §5-7, 와이어프레임 「청년 돈 소식」.
// 제목 · 배너 → [왼쪽] 오늘의 한 장 · 필터 · 소식 목록(3열) / [오른쪽] 저장한 소식. 오늘의 한 장과 저장함은 윗선을 맞춘다.
import { useEffect, useMemo, useState } from 'react';
import { FeaturedNews } from '@/components/news/FeaturedNews';
import { NewsBanner } from '@/components/news/NewsBanner';
import { NewsCard, NewsCardSkeleton } from '@/components/news/NewsCard';
import { NewsFilters } from '@/components/news/NewsFilters';
import { SavedNews } from '@/components/news/SavedNews';
import { useNews, type YouthNews } from '@/data/news';
import { readNewsFilter, useSavedNews, writeNewsFilter } from '@/data/newsSaved';
import { todayKst } from '@/lib/deadline';
import { DEFAULT_FILTER, isDefaultFilter, pickMain, selectNews, type NewsFilter } from '@/lib/newsList';

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

  const onToggleSave = (n: YouthNews) => setToast(toggle(n) ? '저장했어요' : '저장을 뺐어요');
  const change = (patch: Partial<NewsFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const clear = () => setFilter((f) => ({ ...DEFAULT_FILTER, sort: f.sort }));

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
            <section aria-labelledby="news-all-title" className="col" style={{ gap: 16 }}>
              <h2 id="news-all-title" className="sec-title">
                전체 소식
              </h2>
              <NewsFilters value={filter} onChange={change} />
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
              ) : (
                <>
                  <div className="news-count" aria-live="polite">
                    <p className="meta">
                      소식 <b className="num">{list.length}</b>개
                    </p>
                    {!isDefaultFilter(filter) && (
                      <button type="button" className="btn btn-text" onClick={clear}>
                        필터 지우기
                      </button>
                    )}
                  </div>
                  {list.length === 0 ? (
                    <div className="empty-box">
                      <h3>조건에 맞는 소식이 없어요</h3>
                      <p className="sub">다른 지역이나 분야로 찾아보세요.</p>
                      <button type="button" className="btn btn-line" onClick={clear}>
                        필터 지우기
                      </button>
                    </div>
                  ) : (
                    <div className="news-grid news-list">
                      {list.map((n) => (
                        <NewsCard key={n.id} n={n} today={today} isSample={isSample} saved={isSaved(n.id)} onToggleSave={() => onToggleSave(n)} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
          <SavedNews saved={saved} items={items} today={today} onRemove={remove} />
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}
