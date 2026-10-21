import { SERIES_MARKS } from './drawTimeChart';

/** 범례용 종목 표식: 선 + 모양(차트의 종목별 표식과 같은 순서). 색만으로 구분하지 않게 쓴다(02 §6-1). */
export function SeriesKey({ index, color }: { index: number; color: string }) {
  const shape = SERIES_MARKS[index % SERIES_MARKS.length];
  const style = { fill: color, stroke: 'var(--card)', strokeWidth: 1.5 };
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6, overflow: 'visible' }}>
      <line x1="0" y1="6" x2="22" y2="6" style={{ stroke: color, strokeWidth: 2.5 }} />
      {shape === 'square' ? (
        <rect x="7" y="2" width="8" height="8" style={style} />
      ) : shape === 'diamond' ? (
        <path d="M11 0.5L16.5 6L11 11.5L5.5 6Z" style={style} />
      ) : shape === 'triangle' ? (
        <path d="M11 0.5L16 10L6 10Z" style={style} />
      ) : (
        <circle cx="11" cy="6" r="4.5" style={style} />
      )}
    </svg>
  );
}
