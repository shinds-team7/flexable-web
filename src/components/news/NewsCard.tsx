// 소식 카드: 분야 + 마감 배지 → 제목 → 얼마 아끼나 → 조건 한 줄(나이 / 소득 기준) → 출처·마감일 → 공고문(왼쪽) · 저장(오른쪽 아래).
// 오늘 할 일은 당분간 카드에서 뺀다(데이터 필드 action은 유지).
import { Link } from 'react-router-dom';
import { categoryLabel, type YouthNews } from '@/data/news';
import { fmtMonthDay } from '@/lib/format';
import { conditionText } from '@/lib/newsList';
import { DeadlineBadge, NoticeLink, SaveButton, deadlineDateText } from './NewsBits';

type Props = { n: YouthNews; today: string; isSample: boolean; saved: boolean; onToggleSave: () => void };

export function NewsCard({ n, today, isSample, saved, onToggleSave }: Props) {
  return (
    <article className="news-card" aria-labelledby={`news-${n.id}`}>
      <div className="top">
        <span className="news-tags">
          <span className="tag">{categoryLabel(n.category)}</span>
          <DeadlineBadge period={n} today={today} />
        </span>
        {isSample && <span className="tag-ex">예시</span>}
      </div>
      {n.correctedAt && <p className="news-corrected">{fmtMonthDay(n.correctedAt)} 정정</p>}
      <h3 id={`news-${n.id}`}>{n.title}</h3>
      <p className="save-line">{n.benefit}</p>
      <p className="news-age">{conditionText(n)}</p>
      {n.calcLink && (
        <Link className="btn btn-line btn-sm" to={n.calcLink.to} style={{ alignSelf: 'flex-start' }}>
          {n.calcLink.label}
        </Link>
      )}
      <div className="news-card-foot">
        <p className="meta">
          {n.source.org} · {deadlineDateText(n)}
        </p>
        <div className="news-src-acts">
          <NoticeLink url={n.source.url} />
          <SaveButton title={n.title} saved={saved} onToggle={onToggleSave} />
        </div>
      </div>
    </article>
  );
}

export function NewsCardSkeleton() {
  return (
    <div className="news-card" aria-hidden="true">
      <div className="skel" style={{ height: 20, width: '40%' }} />
      <div className="skel" style={{ height: 44 }} />
      <div className="skel" style={{ height: 16, width: '70%' }} />
      <div className="skel" style={{ height: 16, width: '55%' }} />
    </div>
  );
}
