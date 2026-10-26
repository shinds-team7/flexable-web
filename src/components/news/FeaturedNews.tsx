// 오늘의 한 장: 고른 소식 1개를 크게(slot=MAIN, 없으면 화면이 고른다). 요약은 AI 요약이고 없으면 줄을 뺀다.
import { categoryLabel, type YouthNews } from '@/data/news';
import { ageText, regionText } from '@/lib/newsList';
import { DeadlineBadge, NoticeLink, SaveButton, deadlineText } from './NewsBits';

type Props = { main: YouthNews; today: string; isSample: boolean; saved: boolean; onToggleSave: () => void };

export function FeaturedNews({ main, today, isSample, saved, onToggleSave }: Props) {
  return (
    <article className="card card-hero news-feature" aria-labelledby="news-main-title">
      <div>
        <div className="news-tags">
          <span className="tag tag-ai">오늘의 한 장</span>
          <span className="tag">{categoryLabel(main.category)}</span>
          <DeadlineBadge period={main} today={today} />
          {isSample && <span className="tag-ex">예시</span>}
        </div>
        <h2 id="news-main-title" className="news-main-title">
          {main.title}
        </h2>
        {main.summary && (
          <p className="news-main-benefit">
            {!isSample && <span className="news-ai">AI 요약</span>}
            {main.summary}
          </p>
        )}
        <p className="news-age">{ageText(main)}</p>
        <div className="toolbar" style={{ marginTop: 24 }}>
          <NoticeLink url={main.source.url} className="btn btn-primary btn-sm" />
          <SaveButton title={main.title} saved={saved} onToggle={onToggleSave} />
        </div>
        <p className="meta" style={{ marginTop: 10 }}>
          {main.source.org} · 신청 기간은 바뀔 수 있어요. 공고문에서 꼭 확인하세요.
        </p>
      </div>
      <div className="card-sunken news-facts-box">
        <dl className="news-facts">
          <div className="set-row">
            <dt className="k">누가</dt>
            <dd className="v">
              {main.audience.summary ? `${ageText(main)} · ${main.audience.summary}` : ageText(main)}
            </dd>
          </div>
          <div className="set-row">
            <dt className="k">어디서</dt>
            <dd className="v">{regionText(main)}</dd>
          </div>
          <div className="set-row">
            <dt className="k">언제까지</dt>
            <dd className="v">{deadlineText(main)}</dd>
          </div>
          <div className="set-row">
            <dt className="k">기관</dt>
            <dd className="v">{main.source.org}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
