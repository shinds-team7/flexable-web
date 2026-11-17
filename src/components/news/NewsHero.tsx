// 조건으로 찾기 바로 위: 중앙 검색창.
import type { ReactNode } from 'react';

type Props = { children: ReactNode };

export function NewsHero({ children }: Props) {
  return <div className="news-hero">{children}</div>;
}
