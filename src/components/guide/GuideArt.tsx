// 금융 가이드 화면의 일러스트. 이미지는 public/guide/*.png(디자인 시안의 3D 아이콘·배너 일러스트에서 잘라 낸 것).
// 장식이라 대체 텍스트를 비우고 스크린리더에서 숨긴다.
import type { FinanceArtId, GuideCategory } from '@/data/financeGuide';

const src = (id: string) => `/guide/${id}.png`;

/** 카테고리·콘텐츠 카드에 쓰는 그림 */
export function FinanceArt({ id, className }: { id: FinanceArtId; className?: string }) {
  return <img className={className} src={src(id)} alt="" aria-hidden="true" loading="lazy" decoding="async" />;
}

/** 메인 카테고리 카드의 그림: 금융 기초는 통장과 동전, 저축과 투자는 올라가는 막대와 화살표. 색은 각 카드 배경에 맞춘 토큰이다(블루, 푸른 보라) */
export function TopicArt({ id }: { id: GuideCategory }) {
  return (
    <svg className="fin-topic-art" viewBox="0 0 96 80" aria-hidden="true" focusable="false">
      {id === 'basic' ? (
        <>
          <rect x="10" y="20" width="62" height="46" rx="7" fill="var(--color-series-3)" />
          <rect x="18" y="12" width="62" height="46" rx="7" fill="var(--color-series-2)" />
          <rect x="18" y="23" width="62" height="9" fill="var(--color-series-1)" />
          <rect x="26" y="41" width="24" height="5" rx="2.5" fill="var(--color-surface)" />
          <circle cx="72" cy="58" r="15" fill="var(--color-series-1)" stroke="var(--color-surface)" strokeWidth="3" />
          <path d="M66 52l3 12 3-9 3 9 3-12M64.5 57h15" fill="none" stroke="var(--color-on-brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <rect className="fin-art-violet-1" x="14" y="50" width="16" height="23" rx="4" />
          <rect className="fin-art-violet-2" x="40" y="39" width="16" height="33" rx="4" />
          <rect className="fin-art-violet-3" x="66" y="30" width="16" height="42" rx="4" />
          <path className="fin-art-violet-line" d="M20 40C32 38 52 30 70 11M58 10h13v13" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/** AI 목표 달성 안내 띠의 과녁 그림. 위 카테고리 카드 그림과 같은 평면 그림이다 */
export function TargetArt() {
  return (
    <svg className="fin-target-art" viewBox="0 0 68 64" aria-hidden="true" focusable="false">
      <circle cx="30" cy="34" r="26" fill="var(--color-series-3)" />
      <circle cx="30" cy="34" r="18" fill="var(--color-series-2)" />
      <circle cx="30" cy="34" r="10" fill="var(--color-surface)" />
      <circle cx="30" cy="34" r="5" fill="var(--color-series-1)" />
      <path d="M31 33L50 14" fill="none" stroke="var(--color-series-1)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M50 14V6l7-5v8h8l-7 5z" fill="var(--color-series-1)" />
    </svg>
  );
}
