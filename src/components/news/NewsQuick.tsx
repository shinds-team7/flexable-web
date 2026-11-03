// 검색창 아래 두 카드: 내 지원금 찾기(조건으로 찾기·마감 임박으로 이어 줌) · 요즘 핫한 지원금(최근 7일 이 사이트에서 많이 연 순서).
import type { YouthNews } from '@/data/news';
import { recordNewsView, type HotNews } from '@/data/newsHot';
import { deadlineState } from '@/lib/deadline';
import type { HotPick } from '@/lib/newsInsight';
import { DeadlineBadge } from './NewsBits';

type FindProps = { onGoConditions: () => void; onGoDeadline: () => void };

export function FindMine({ onGoConditions, onGoDeadline }: FindProps) {
  return (
    <section className="news-quick-card" aria-labelledby="news-find-title">
      <img className="news-quick-art" src="/characters/lv3-3.png" alt="" width={72} height={72} />
      <div className="news-quick-body">
        <h2 id="news-find-title">내 지원금 찾기</h2>
        <p className="meta">나이·지역·주제를 고르면 해당하는 지원금을 모아 보여 드려요.</p>
        <div className="news-quick-acts">
          <button type="button" className="btn btn-primary btn-sm" onClick={onGoConditions}>
            조건으로 찾기
          </button>
          <button type="button" className="btn btn-line btn-sm" onClick={onGoDeadline}>
            마감 임박
          </button>
        </div>
      </div>
    </section>
  );
}

type HotProps = { picks: HotPick[]; hot: HotNews | undefined; today: string; isSample: boolean };

export function HotNewsCard({ picks, hot, today, isSample }: HotProps) {
  const counted = picks.some((p) => p.visitors != null);
  return (
    <section className="news-quick-card news-hot" aria-labelledby="news-hot-title">
      <div className="news-quick-body">
        <h2 id="news-hot-title">
          요즘 핫한 지원금 {isSample && <span className="tag-ex">예시</span>}
        </h2>
        <p className="meta">
          {counted ? `최근 ${hot?.windowDays ?? 7}일 동안 이 사이트에서 많이 연 순서예요.` : '열람 집계가 쌓이기 전이라 마감이 가까운 순서로 보여 드려요.'}
        </p>
        {picks.length === 0 ? (
          <p className="meta">보여 드릴 지원금이 아직 없어요.</p>
        ) : (
          <ol className="news-hot-list">
            {picks.map(({ n, visitors }, i) => (
              <li key={n.id}>
                <span className="news-hot-rank num">{i + 1}</span>
                <HotLink n={n} isSample={isSample} />
                <span className="news-hot-meta">
                  {visitors != null ? (
                    <span className="meta num">{visitors}명이 봤어요</span>
                  ) : (
                    deadlineState(n, today).kind !== 'closed' && <DeadlineBadge period={n} today={today} />
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function HotLink({ n, isSample }: { n: YouthNews; isSample: boolean }) {
  if (!n.source.url.trim()) return <span className="news-hot-title">{n.title}</span>;
  return (
    <a className="news-hot-title" href={n.source.url} target="_blank" rel="noreferrer" onClick={() => !isSample && recordNewsView(n.id)}>
      {n.title}
      <span className="sr-only">(공고문, 새 창)</span>
    </a>
  );
}
