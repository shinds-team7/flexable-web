// 금융 가이드 화면의 일러스트. 이미지는 public/guide/*.png(디자인 시안의 3D 아이콘·배너 일러스트에서 잘라 낸 것).
// 장식이라 대체 텍스트를 비우고 스크린리더에서 숨긴다.
import type { FinanceArtId } from '@/data/financeGuide';

const src = (id: string) => `/guide/${id}.png`;

/** 카테고리·콘텐츠 카드에 쓰는 그림 */
export function FinanceArt({ id, className }: { id: FinanceArtId; className?: string }) {
  return <img className={className} src={src(id)} alt="" aria-hidden="true" loading="lazy" decoding="async" />;
}

/** 히어로 오른쪽 그림: 디자인 시안의 배너 일러스트 한 장(구름·차트·동전·책·책 읽는 고양이). 아래쪽은 배너 밖으로 살짝 잘린다 */
export function FinanceHeroArt() {
  return (
    <div className="fin-hero-art" aria-hidden="true">
      <img src={src('hero')} alt="" width={1400} height={561} />
    </div>
  );
}

/** AI 목표 달성 안내 띠의 과녁 그림 */
export function TargetArt() {
  return <img className="fin-target-art" src={src('target')} alt="" aria-hidden="true" loading="lazy" decoding="async" />;
}
