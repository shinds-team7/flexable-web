import { useEffect, useRef, type CSSProperties } from 'react';
import { drawTimeChart, type TimeChartOptions } from './drawTimeChart';

/** drawTimeChart를 React에서 쓰는 감싸개. 폭이 바뀌면 다시 그린다. */
export function TimeChart({ label, style, afterDraw, ...opts }: TimeChartOptions & { label: string; style?: CSSProperties; afterDraw?: (wrap: HTMLDivElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const afterRef = useRef(afterDraw);
  afterRef.current = afterDraw;
  const { sim, from, to, mode, height, compact, selectedId } = opts;

  useEffect(() => {
    const wrap = ref.current;
    if (!wrap) return;
    let lastW = -1;
    const draw = () => {
      if (wrap.clientWidth === lastW) return;
      lastW = wrap.clientWidth;
      drawTimeChart(wrap, optsRef.current);
      afterRef.current?.(wrap);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [sim, from, to, mode, height, compact, selectedId]);

  return <div ref={ref} className="chart-wrap" role="group" aria-label={label} style={style} />;
}
