// 청년 소식 분석: 왼쪽 파란 카드(지금 신청할 수 있는 소식의 분야별 건수·이번 달 신청 시작·마감·상시 모집) + 오른쪽 입력 요령 글 카드.
// 숫자는 모두 지금 받은 소식 목록을 세어 만든다(lib/newsInsight.ts). 새 소식 수집이 늘면 같이 바뀐다.
import { Link } from 'react-router-dom';
import type { MonthInsight } from '@/lib/newsInsight';
import { useCountUp } from '@/lib/motion';

/** 분야별 한 줄: 막대가 0에서 차오르고 숫자가 0부터 올라온다. 위쪽 줄부터 차례로 시작한다. */
function BarRow({ label, count, max, index }: { label: string; count: number; max: number; index: number }) {
  const delay = index * 120;
  const shown = useCountUp(count, { duration: 1000, delay });
  return (
    <li>
      <span className="news-bar-k">{label}</span>
      <span className="news-bar-track" aria-hidden="true">
        <span className="news-bar-fill" style={{ width: `${(count / max) * 100}%`, animationDelay: `${delay}ms` }} />
      </span>
      <span className="news-bar-v num" aria-label={`${count}건`}>
        <span aria-hidden="true">{shown}건</span>
      </span>
    </li>
  );
}

export const GUIDE_PATH = '/news/guide';
export const GUIDE_META = { tag: '기초 개념', date: '2026-11-03', title: '조건으로 찾기 입력 요령' };

export function InsightCard({ insight: m, isSample }: { insight: MonthInsight; isSample: boolean }) {
  const cats = [...m.categories].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...cats.map((c) => c.count));
  const lead = m.categories[0];
  return (
    <article className="news-insight" aria-labelledby="news-insight-title">
      <p className="news-insight-eyebrow">
        {m.month}월 청년 소식 정리 · 지금 신청할 수 있는 소식
        {isSample && <span className="news-insight-ex">예시</span>}
      </p>
      <h2 id="news-insight-title" className="news-insight-title">
        지금 신청할 수 있는 청년 소식 <span className="num">{m.total.toLocaleString('ko-KR')}건</span>
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
      <ul className="news-bars" aria-label="분야별 청년 소식">
        {cats.map((c, i) => (
          <BarRow key={c.id} label={c.label} count={c.count} max={max} index={i} />
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
          <dt>상시 모집</dt>
          <dd className="num">{m.always.toLocaleString('ko-KR')}건</dd>
        </div>
      </dl>
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
