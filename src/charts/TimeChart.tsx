import { useEffect, useRef, type CSSProperties } from 'react';
import { drawTimeChart, type TimeChartOptions } from './drawTimeChart';

/**
 * drawTimeChart를 React에서 쓰는 감싸개. 폭이 바뀌면 다시 그린다.
 * revealKey를 주면 그 값이 바뀔 때(처음 그릴 때·종목이나 기간을 바꿀 때)만 선이 왼쪽부터 그려진다(RevealClip의 replayKey와 같은 역할).
 * 핀 고르기·폭 변화로 다시 그릴 때는 바로 보인다.
 */
export function TimeChart({
  label,
  style,
  afterDraw,
  revealKey,
  ...opts
}: Omit<TimeChartOptions, 'reveal'> & { label: string; style?: CSSProperties; afterDraw?: (wrap: HTMLDivElement) => void; revealKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const afterRef = useRef(afterDraw);
  afterRef.current = afterDraw;
  const { data, from, to, mode, height, compact, selectedId, area } = opts;
  const revealed = useRef<{ key?: string; at: number }>({ at: 0 });

  useEffect(() => {
    const wrap = ref.current;
    if (!wrap) return;
    let lastW = -1;
    // 개발 모드(StrictMode)는 effect를 곧바로 두 번 돌린다. 방금(100ms 안) 드러내기 시작했으면 두 번째도 드러낸다
    const now = performance.now();
    let reveal = revealKey != null && (revealKey !== revealed.current.key || now - revealed.current.at < 100);
    if (reveal) revealed.current = { key: revealKey, at: revealKey !== revealed.current.key ? now : revealed.current.at };
    const draw = () => {
      if (wrap.clientWidth === lastW) return;
      lastW = wrap.clientWidth;
      drawTimeChart(wrap, { ...optsRef.current, reveal });
      reveal = false;
      afterRef.current?.(wrap);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data, from, to, mode, height, compact, selectedId, area, revealKey]);

  return <div ref={ref} className="chart-wrap" role="group" aria-label={label} style={style} />;
}
