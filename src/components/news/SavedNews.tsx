// 오른쪽 저장함. 필터·마감과 상관없이 저장한 소식은 남는다. 좁은 화면에서는 목록 위에서 접었다 펼친다.
import { useState } from 'react';
import type { YouthNews } from '@/data/news';
import type { SavedNews as Saved } from '@/data/newsSaved';
import { deadlineState } from '@/lib/deadline';
import { DeadlineBadge, NoticeLink } from './NewsBits';

type Props = { saved: Saved[]; items: YouthNews[]; today: string; onRemove: (id: string) => void };

export function SavedNews({ saved, items, today, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={'card rail news-rail' + (open ? '' : ' collapsed')} aria-labelledby="news-saved-title">
      <div className="news-rail-head">
        <h2 id="news-saved-title">
          저장한 소식 <span className="muted num">{saved.length}</span>
        </h2>
        <button type="button" className="btn btn-text news-saved-toggle" aria-expanded={open} aria-controls="news-saved-body" onClick={() => setOpen((v) => !v)}>
          {open ? '접기' : '펼치기'}
        </button>
      </div>
      <div id="news-saved-body" className="news-saved-body">
        {saved.length === 0 ? (
          <div className="news-saved-empty">
            <p style={{ fontWeight: 700 }}>아직 저장한 소식이 없어요.</p>
            <p className="meta">관심 있는 소식의 책갈피를 눌러 두세요.</p>
          </div>
        ) : (
          <ul className="news-saved-list">
            {saved.map((s) => {
              // 목록에 같은 소식이 있으면 최신 값(기한 변경·정정)을 쓴다
              const cur = items.find((n) => n.id === s.id);
              const period = cur ?? s;
              const closed = deadlineState(period, today).kind === 'closed';
              return (
                <li key={s.id} className={'news-saved-item' + (closed ? ' closed' : '')}>
                  <p className="news-saved-title">{cur?.title ?? s.title}</p>
                  <p className="meta">{cur?.benefit ?? s.benefit}</p>
                  <div className="news-saved-acts">
                    <DeadlineBadge period={period} today={today} />
                    <span className="spacer" />
                    <NoticeLink url={cur?.source.url ?? s.url} />
                    <button type="button" className="btn btn-text news-remove" onClick={() => onRemove(s.id)} aria-label={`${s.title} 저장 빼기`}>
                      빼기
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="meta" style={{ marginTop: 12 }}>
          마감이 지난 소식은 여기에 '마감됨'으로 남아요. 저장은 이 브라우저에만 돼요.
        </p>
      </div>
    </aside>
  );
}
