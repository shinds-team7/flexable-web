// 조건으로 찾기 바로 위: 중앙 검색창과 그 아래 30초 진단 링크.
import type { ReactNode } from 'react';

type Props = { onGoConditions: () => void; children: ReactNode };

export function NewsHero({ onGoConditions, children }: Props) {
  return (
    <div className="news-hero">
      {children}
      <button type="button" className="news-hero-link" onClick={onGoConditions}>
        뭘 받을지 모르겠다면 30초 진단 <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
