// 지원금 분석: 왼쪽 파란 카드(이번 달 분야별 건수·신청 시작·마감·기간) + 오른쪽 입력 요령 글 카드.
// 숫자는 모두 지금 받은 소식 목록을 세어 만든다(lib/newsInsight.ts). 새 소식 수집이 늘면 같이 바뀐다.
import { Link } from 'react-router-dom';
import type { MonthInsight } from '@/lib/newsInsight';

export const GUIDE_PATH = '/news/guide';
export const GUIDE_META = { tag: '기초 개념', date: '2026-11-03', title: '조건으로 찾기 입력 요령' };

export function InsightCard({ insight: m, isSample }: { insight: MonthInsight; isSample: boolean }) {
  const max = Math.max(1, ...m.categories.map((c) => c.count));
  const lead = m.categories[0];
  const fromMonth = m.basis === 'month';
  return (
    <article className="news-insight" aria-labelledby="news-insight-title">
      <p className="news-insight-eyebrow">
        {m.month}월 지원금 정리 · {fromMonth ? '이번 달 올라온 소식' : '지금 신청할 수 있는 소식'}
        {isSample && <span className="news-insight-ex">예시</span>}
      </p>
      <h2 id="news-insight-title" className="news-insight-title">
        {fromMonth ? '새로 나온 지원금' : '지금 열린 지원금'} <span className="num">{m.total.toLocaleString('ko-KR')}건</span>
      </h2>
      {lead ? (
        <p className="news-insight-sub">
          분야는{' '}
          <b>
            {lead.label} {lead.count}건
          </b>
          이 가장 많았고
          {m.topRegion ? (
            <>
              , 지역은{' '}
              <b>
                {m.topRegion.name} {m.topRegion.count}건
              </b>
              으로 1위입니다.
            </>
          ) : (
            '.'
          )}
        </p>
      ) : (
        <p className="news-insight-sub">집계할 소식이 아직 없어요.</p>
      )}
      <p className="news-insight-k">분야별 지원금</p>
      <ul className="news-bars">
        {m.categories.map((c) => (
          <li key={c.id}>
            <span className="news-bar-k">{c.label}</span>
            <span className="news-bar-track" aria-hidden="true">
              <span className="news-bar-fill" style={{ width: `${(c.count / max) * 100}%` }} />
            </span>
            <span className="news-bar-v num">{c.count}건</span>
          </li>
        ))}
      </ul>
      <dl className="news-insight-tiles">
        <div>
          <dt>이번 달 신청 시작</dt>
          <dd className="num">{m.starts.toLocaleString('ko-KR')}건</dd>
        </div>
        <div>
          <dt>이번 달 신청 마감</dt>
          <dd className="num">{m.deadlines.toLocaleString('ko-KR')}건</dd>
        </div>
        <div>
          <dt>신청 기간(중간값)</dt>
          <dd className="num">{m.medianDays != null ? `${m.medianDays}일` : '-'}</dd>
        </div>
      </dl>
      <p className="news-insight-foot">신청 시작·마감일을 원문에서 확인한 소식만 센 값이에요. 신청 전엔 공고문을 꼭 확인하세요.</p>
    </article>
  );
}

export function GuideCard() {
  return (
    <Link className="news-guide-card" to={GUIDE_PATH}>
      <div className="news-guide-art">
        <img src="/cal.png" alt="" width={220} height={220} />
      </div>
      <div className="news-guide-body">
        <p className="news-guide-meta">
          <span className="tag">{GUIDE_META.tag}</span> <span className="meta">{GUIDE_META.date}</span>
        </p>
        <h3>{GUIDE_META.title}</h3>
        <p className="news-guide-desc">지역·나이·주제를 여러 개 고르면 어떻게 찾는지, 목록이 길어졌을 때 줄이는 순서와 신청 전에 확인할 것을 정리했어요.</p>
      </div>
    </Link>
  );
}
