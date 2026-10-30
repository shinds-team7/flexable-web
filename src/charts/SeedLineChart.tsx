// 시드머니가 쌓인 모양: 정산 주기마다 누적액을 잇는 꺾은선 그래프. 점마다 그 주기에 반영한 돈을 툴팁으로 보여 준다.
// 첫 점은 시작일의 모아둔 돈(saved=null)일 수 있다. 누적액은 앱이 준 값이고 여기서 계산하지 않는다.
import { useEffect, useRef, useState } from 'react';
import { krShort, niceTicks, won } from '@/lib/format';
import { RevealClip } from './RevealClip';

export type SeedPoint = { date: string; saved: number | null; cum: number }; // date: "2026-04-25", saved=null이면 시작점

const H = 260;
const M = { l: 56, r: 20, t: 20, b: 32 };

export function SeedLineChart({ data, isSample = false }: { data: SeedPoint[]; isSample?: boolean }) {
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

  if (data.length === 0) return null;
  const vals = data.map((d) => d.cum);
  const ticks = niceTicks(Math.min(...vals) * 0.9, Math.max(...vals) * 1.08, 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const step = data.length > 1 ? (W - M.l - M.r) / (data.length - 1) : 0;
  const X = (i: number) => (data.length > 1 ? M.l + step * i : (M.l + W - M.r) / 2);
  const Y = (v: number) => M.t + (1 - (v - lo) / (hi - lo || 1)) * (H - M.t - M.b);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d.cum).toFixed(1)}`).join(' ');
  const label = (m: string, i: number) => {
    const [y, mo] = m.split('-').map(Number);
    const prev = i > 0 ? data[i - 1].date.slice(0, 7) : '';
    if (i > 0 && prev === m.slice(0, 7)) return `${mo}.${Number(m.slice(8, 10))}`;
    return mo === 1 || i === 0 ? `${y}.${String(mo).padStart(2, '0')}` : `${mo}월`;
  };
  const every = data.length <= 12 ? 1 : 3;
  const last = data.length - 1;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(step ? Math.max(0, Math.min(last, Math.round((px - M.l) / step))) : 0);
  };

  const h = hover != null ? data[hover] : null;
  const [hy, hm, hd] = h ? h.date.split('-').map(Number) : [0, 0, 0];
  const tipLeft = hover != null ? (X(hover) + 12 + 200 > W ? X(hover) - 212 : X(hover) + 12) : 0;
  const tipTop = h ? Math.max(0, Y(h.cum) - 84) : 0;

  return (
    <div ref={ref} className="chart-wrap" role="group" aria-label="시드머니가 쌓인 모양 꺾은선 그래프">
      <svg width={W} height={H} aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-l" x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} />
            <text className="axis-t" x={M.l - 8} y={Y(t) + 4} textAnchor="end">
              {krShort(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % every === 0 || i === last ? (
            <text key={i} className="axis-t" x={X(i)} y={H - 10} textAnchor="middle">
              {label(d.date, i)}
            </text>
          ) : null,
        )}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={M.t} y2={H - M.b} style={{ stroke: 'var(--text-muted)' }} />}
        <RevealClip width={W} height={H} replayKey={`${data.length}-${data[0]?.date}`}>
          <path d={line} style={{ fill: 'none', stroke: 'var(--brand)', strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
        </RevealClip>
        {data.map((d, i) => (
          <circle
            key={i}
            cx={X(i)}
            cy={Y(d.cum)}
            r={hover === i || i === last ? 5 : 3.5}
            style={{ fill: i === last || hover === i ? 'var(--brand)' : 'var(--card)', stroke: 'var(--brand)', strokeWidth: 2 }}
          />
        ))}
        <rect x={M.l - 10} y={M.t} width={W - M.l - M.r + 20} height={H - M.t - M.b} style={{ fill: 'transparent' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {h && (
        <div className="tip" style={{ left: tipLeft, top: tipTop, width: 200 }}>
          <div className="meta">{isSample ? `${hy}년 ${hm}월 · 예시` : h.saved == null ? `${hy}년 ${hm}월 ${hd}일 시작` : `${hy}년 ${hm}월 ${hd}일 정산`}</div>
          <div className="t-val num">{won(h.cum)}원</div>
          <div>{isSample ? '누적 시드머니 예시' : h.saved == null ? '처음 모아둔 돈' : `그 주기에 반영한 돈 ${won(h.saved)}원`}</div>
        </div>
      )}
      <p className="sr-only">
        {data.map((d) => `${d.date} ${isSample ? '누적 예시' : d.saved == null ? '시작' : '누적'} ${won(d.cum)}원`).join(', ')}
      </p>
    </div>
  );
}
