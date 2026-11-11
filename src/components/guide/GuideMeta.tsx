// 금융 가이드 카드의 읽는 시간 · 조회수 줄. 메인(/guide)과 카테고리 화면(/guide/basic · /guide/product)이 같이 쓴다.
// 조회수는 서버 집계(useGuideViews)를 아직 못 받았으면 숨긴다. 분류 꼬리표(GuideCat)와 표지 미리보기(GuideThumb)도 여기 둔다.
import { FinanceArt } from '@/components/guide/GuideArt';
import { CATEGORY_LABEL, TOPIC_LABEL, type GuideContent } from '@/data/financeGuide';
import { GUIDE_ARTICLES } from '@/data/guideArticles';
import { won } from '@/lib/format';

/** 표지 미리보기(2:1): 글 원고의 표지 이미지, 없으면 카드 그림(art). 마우스를 올리면 틀 안에서 확대된다(CSS) */
export function GuideThumb({ c, className }: { c: Pick<GuideContent, 'id' | 'art'>; className: string }) {
  const cover = GUIDE_ARTICLES[c.id]?.cover;
  return (
    <span className={`fin-thumb ${className}`}>
      {cover ? <img className="fin-thumb-cover" src={cover.src} alt="" loading="lazy" decoding="async" /> : <FinanceArt id={c.art} />}
    </span>
  );
}

/** 분류 꼬리표: 금융 기초(하늘색) · 저축(연한 보라) · 투자(보라) */
export function GuideCat({ c }: { c: Pick<GuideContent, 'category' | 'topic'> }) {
  return <span className={`fin-cat fin-cat-${c.topic ?? c.category}`}>{c.topic ? TOPIC_LABEL[c.topic] : CATEGORY_LABEL[c.category]}</span>;
}

export function GuideMeta({ minutes, views }: { minutes: number; views?: number }) {
  return (
    <span className="fin-meta">
      <span>
        <ClockIcon />약 {minutes}분
      </span>
      {views !== undefined && (
        <span>
          <EyeIcon />
          <span className="num">{won(views)}</span>
        </span>
      )}
    </span>
  );
}

const EyeIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.5V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
