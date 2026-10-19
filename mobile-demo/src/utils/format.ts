/** 1234567 -> "1,234,567" (Intl 미지원 환경 대비 직접 구현) */
export function won(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1590000 -> "159만원", 45000 -> "4.5만원" */
export function manwon(n: number): string {
  const m = n / 10000;
  if (m >= 100) return `${won(Math.round(m))}만원`;
  return `${Number(m.toFixed(1))}만원`;
}

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
