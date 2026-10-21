// 여러 선 비교(적금 '기간 동안 내 돈' 등): 계열마다 선 하나 + 회색 기준선. 끝 라벨·범례·마우스 위치의 세로선과 툴팁을 준다.
// 색은 계열이 고른 칸(colorSlot)을 따른다. 순위로 칠하지 않는다. 4·5번째 칸은 선 무늬를 더한다(02 §6-2).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { krShort, niceTicks, won } from '@/lib/format';

export type LinePoint = { x: number; y: number };
export type LineSeries = { id: string; name: string; colorSlot: number; points: LinePoint[] };

const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
const DASH = [undefined, undefined, undefined, '7 4', '2 4'];
export const seriesColor = (slot: number) => COLORS[slot % COLORS.length];
export const seriesDash = (slot: number) => DASH[slot % DASH.length];

const H = 260;
const M = { l: 56, r: 84, t: 16, b: 32 };
const LABEL_GAP = 16;

type Props = {
  series: LineSeries[];
  baseline?: { name: string; y: number }; // 회색 점선(예: 이자 없는 통장 = 0)
  xLabel: (x: number) => string;
  tooltip: (x: number) => ReactNode;
  ariaLabel: string;
};

/** 끝 라벨이 겹치지 않게 위아래로 민다. */
function spread(ys: number[], top: number, bottom: number) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + LABEL_GAP);
  const over = order.length ? order[order.length - 1].y - bottom : 0;
  if (over > 0) for (const o of order) o.y = Math.max(top, o.y - over);
  const out = [...ys];
  for (const o of order) out[o.i] = o.y;
  return out;
}

export function MultiLineChart({ series, baseline, xLabel, tooltip, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xs = series[0]?.points.map((p) => p.x) ?? [];
  if (xs.length === 0) return null;
  const all = series.flatMap((s) => s.points.map((p) => p.y)).concat(baseline ? [baseline.y] : []);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all) * 1.05, 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const step = xs.length > 1 ? (W - M.l - M.r) / (xs.length - 1) : 0;
  const X = (i: number) => (xs.length > 1 ? M.l + step * i : (M.l + W - M.r) / 2);
  const Y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const last = xs.length - 1;
  // 눈금 글자가 겹치지 않게 칸 너비 56px 이상이 되는 가장 작은 간격(1·2·3·6·12개월)
  const every = [1, 2, 3, 6, 12].find((n) => step * n >= 56) ?? 12;
  const labelY = spread(
    series.map((s) => Y(s.points[last].y)),
    M.t + 4,
    H - M.b - 4,
  );

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    setHover(step ? Math.max(0, Math.min(last, Math.round((e.clientX - r.left - M.l) / step))) : 0);
  };
  const tipW = 220;
  const tipLeft = hover != null ? (X(hover) + 12 + tipW > W ? X(hover) - tipW - 12 : X(hover) + 12) : 0;

  return (
    <div ref={ref} className="chart-wrap" role="group" aria-label={ariaLabel}>
      <svg width={W} height={H} aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-l" x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} />
            <text className="axis-t" x={M.l - 8} y={Y(t) + 4} textAnchor="end">
              {krShort(t)}
            </text>
          </g>
        ))}
        {xs.map((x, i) =>
          (i + 1) % every === 0 ? (
            <text key={x} className="axis-t" x={X(i)} y={H - 10} textAnchor="middle">
              {xLabel(x)}
            </text>
          ) : null,
        )}
        {baseline && <line x1={M.l} x2={W - M.r} y1={Y(baseline.y)} y2={Y(baseline.y)} style={{ stroke: 'var(--baseline)', strokeWidth: 2, strokeDasharray: '4 4' }} />}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={M.t} y2={H - M.b} style={{ stroke: 'var(--text-muted)' }} />}
        {series.map((s) => (
          <path
            key={s.id}
            d={s.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ')}
            style={{ fill: 'none', stroke: seriesColor(s.colorSlot), strokeWidth: 2, strokeDasharray: seriesDash(s.colorSlot), strokeLinejoin: 'round', strokeLinecap: 'round' }}
          />
        ))}
        {series.map((s, k) => {
          const i = hover ?? last;
          return (
            <g key={s.id}>
              <circle cx={X(i)} cy={Y(s.points[i].y)} r={4} style={{ fill: seriesColor(s.colorSlot), stroke: 'var(--card)', strokeWidth: 2 }} />
              <text className="axis-t" x={X(last) + 8} y={labelY[k] + 4} style={{ fill: 'var(--text)', fontWeight: 600 }}>
                {won(s.points[last].y)}원
              </text>
            </g>
          );
        })}
        <rect x={M.l - 10} y={M.t} width={W - M.l - M.r + 20} height={H - M.t - M.b} style={{ fill: 'transparent' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: tipLeft, top: M.t, width: tipW }}>
          {tooltip(xs[hover])}
        </div>
      )}
    </div>
  );
}

/** 차트 위 범례: 계열 색·무늬 + 이름. 기준선은 회색 점선. */
export function LineLegend({ series, baseline }: { series: { id: string; name: string; colorSlot: number }[]; baseline?: string }) {
  const swatch = (color: string, dash?: string) => (
    <svg width="22" height="10" aria-hidden="true">
      <line x1="1" x2="21" y1="5" y2="5" style={{ stroke: color, strokeWidth: 2, strokeDasharray: dash, strokeLinecap: 'round' }} />
    </svg>
  );
  return (
    <div className="legend" style={{ marginBottom: 8 }}>
      {series.map((s) => (
        <span key={s.id}>
          {swatch(seriesColor(s.colorSlot), seriesDash(s.colorSlot))}
          {s.name}
        </span>
      ))}
      {baseline && (
        <span>
          {swatch('var(--baseline)', '4 4')}
          {baseline}
        </span>
      )}
    </div>
  );
}
