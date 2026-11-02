/** 1234567 -> "1,234,567" (Intl 미지원 환경 대비 직접 구현) */
export function won(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
