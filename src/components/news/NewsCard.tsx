// 소식 카드: 마감 배지 · 공유/저장 → 제목 → 요약(얼마 아끼나) → 기간 → 공고문(오른쪽) → 정보 칩(분야·지역·나이·소득 기준·기관) · 예시 표시.
// 카드는 4줄(위 · 본문 · 공고문 · 아래)이고, 같은 줄의 카드끼리 공고문 버튼과 아래 구분선 높이를 맞춘다(subgrid).
// 오늘 할 일은 당분간 카드에서 뺀다(데이터 필드 action은 유지).
import { Link } from 'react-router-dom';
import { categoryLabel, type YouthNews } from '@/data/news';
import { fmtMonthDay } from '@/lib/format';
import { cardTags, periodText } from '@/lib/newsList';
import { DeadlineBadge, NoticeLink, SaveButton, ShareButton } from './NewsBits';

type Props = { n: YouthNews; today: string; isSample: boolean; saved: boolean; onToggleSave: () => void; onToast: (msg: string) => void };

export function NewsCard({ n, today, isSample, saved, onToggleSave, onToast }: Props) {
  return (
    <article className="news-card" aria-labelledby={`news-${n.id}`}>
      <div className="top">
        <DeadlineBadge period={n} today={today} />
        <span className="news-card-acts">
          <ShareButton n={n} onDone={onToast} />
          <SaveButton title={n.title} saved={saved} onToggle={onToggleSave} />
        </span>
      </div>
      <div className="news-card-body">
        {n.correctedAt && <p className="news-corrected">{fmtMonthDay(n.correctedAt)} 정정</p>}
        <h3 id={`news-${n.id}`}>{n.title}</h3>
        <p className="news-card-sum">{n.benefit}</p>
        <p className="news-period">
          <b>기간</b> {periodText(n)}
        </p>
        {n.calcLink && (
          <Link className="news-calc" to={n.calcLink.to}>
            {n.calcLink.label} →
          </Link>
        )}
      </div>
      <div className="news-card-cta">
        <NoticeLink url={n.source.url} className="btn btn-line btn-sm news-notice" arrow={false} />
      </div>
      <div className="news-card-foot">
        <ul className="news-chips" aria-label="분야·지역·대상·기관">
          <li className="news-chip cat">{categoryLabel(n.category)}</li>
          {cardTags(n).map((t) => (
            <li key={t} className="news-chip">
              {t}
            </li>
          ))}
          {isSample && (
            <li className="news-chips-ex">
              <span className="tag-ex">예시</span>
            </li>
          )}
        </ul>
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
