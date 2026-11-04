// 저장한 소식 카드(마이페이지 오른쪽). 마감 임박순(마감된 소식은 맨 아래), 목록에서 빠져도 저장한 소식은 남는다.
import { Link } from 'react-router-dom';
import type { YouthNews } from '@/data/news';
import { recordNewsView } from '@/data/newsHot';
import type { SavedNews as Saved } from '@/data/newsSaved';
import { deadlineState } from '@/lib/deadline';
import { savedDeadlineKey } from '@/lib/newsList';
import { Icon } from '../Icons';
import { DeadlineBadge, NoticeLink } from './NewsBits';

type Props = { saved: Saved[]; items: YouthNews[]; today: string; onRemove: (id: string) => void };

export function SavedNews({ saved, items, today, onRemove }: Props) {
  // 목록에 같은 소식이 있으면 최신 값(기한 변경·정정)을 쓴다
  const rows = saved
    .map((s) => {
      const cur = items.find((n) => n.id === s.id);
      return { s, cur, period: cur ?? s };
    })
    .sort((a, b) => savedDeadlineKey(a.period, today) - savedDeadlineKey(b.period, today));
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h2 id="news-saved-title">
          저장한 소식 <span className="muted num">{saved.length}</span>
        </h2>
        <Link to="/news" style={{ fontSize: 14, fontWeight: 600 }}>
          소식 보러 가기
        </Link>
      </div>
      <div className="news-saved-body">
        {saved.length === 0 ? (
          <div className="news-saved-empty">
            <p style={{ fontWeight: 700 }}>아직 저장한 소식이 없어요.</p>
            <p className="meta">관심 있는 소식의 책갈피를 눌러 두세요.</p>
          </div>
        ) : (
          <ul className="news-saved-list">
            {rows.map(({ s, cur, period }) => {
              const closed = deadlineState(period, today).kind === 'closed';
              return (
                <li key={s.id} className={'news-saved-item' + (closed ? ' closed' : '')}>
                  <div className="news-saved-top">
                    <DeadlineBadge period={period} today={today} />
                    <button type="button" className="news-remove" onClick={() => onRemove(s.id)} aria-label={`${s.title} 저장 빼기`}>
                      <Icon id="i-close" />
                    </button>
                  </div>
                  <p className="news-saved-title">{cur?.title ?? s.title}</p>
                  {(cur?.summary ?? s.summary ?? s.benefit) && <p className="meta">{cur?.summary ?? s.summary ?? s.benefit}</p>}
                  <NoticeLink url={cur?.source.url ?? s.url} className="news-saved-link" arrow={false} onOpen={cur ? () => recordNewsView(s.id) : undefined} />
                </li>
              );
            })}
          </ul>
        )}
        <p className="meta" style={{ marginTop: 12 }}>
          마감이 지난 소식은 여기에 '마감됨'으로 남아요.
        </p>
      </div>
    </div>
  );
}
