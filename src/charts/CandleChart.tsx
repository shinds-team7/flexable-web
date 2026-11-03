import { useRef, useState, type KeyboardEvent } from 'react';
import type { Candle } from '@/data/practice';

/** 사건 기간 띠. n은 선택 기록 번호, from은 공개 기준일, to는 5거래일 뒤 판정일(아직 판정 전이면 null) */
export type EventBand = { n: number; from: string; to: string | null };

const number = new Intl.NumberFormat('ko-KR');
// full이면 공개된 봉 전체를, 아니면 최근 60봉만 그린다. 띠는 공개된 봉 안에서만 그려서 아직 오지 않은 날을 드러내지 않는다
export function CandleChart({ candles, full = false, bands = [], activeBand = null, onActiveBand }: {
  candles: Candle[]; full?: boolean; bands?: EventBand[]; activeBand?: number | null; onActiveBand?: (n: number | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const visible = full ? candles : candles.slice(-60);
  const active = visible.find(c => c.date === hover) ?? visible.at(-1);
  if (!active) return <div className="practice-chart-empty"><span className="practice-empty-icon">▥</span><h3>나의 선택으로 이어지는 차트</h3><p>업종과 금액을 정하고 연습을 시작해 보세요.</p><p>하루씩 시세를 살펴보다 사건이 나오면 선택할 수 있어요.</p></div>;
  const low = Math.min(...visible.map(c => c.low)), high = Math.max(...visible.map(c => c.high));
  const range = Math.max(high - low, high * 0.04, 1);
  const top = high + range * .14, bottom = low - range * .14;
  const y = (value: number) => 24 + (top - value) / (top - bottom) * 266;
  const step = 760 / Math.max(30, visible.length), width = Math.max(Math.min(3, step * .8), step * .58);
  const x = (i: number) => 24 + i * step;
  // 봉은 Tab 한 번으로 들어가 방향키로 옮긴다(전체 구간이면 봉이 250개까지 늘어나므로)
  const focused = Math.max(0, visible.findIndex(c => c.date === hover));
  const tabStop = hover ? focused : visible.length - 1;
  const move = (e: KeyboardEvent<SVGGElement>, i: number) => {
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? visible.length - 1 : -2;
    if (to === -2) return;
    e.preventDefault();
    svg.current?.querySelectorAll<SVGGElement>('.practice-candle')[Math.min(visible.length - 1, Math.max(0, to))]?.focus();
  };
  const spans = bands.flatMap(b => {
    const last = visible.at(-1)!.date;
    if (b.from > last || (b.to && b.to < visible[0].date)) return [];
    const start = visible.findIndex(c => c.date >= b.from);
    const end = b.to && b.to <= last ? visible.findLastIndex(c => c.date <= b.to!) : visible.length - 1;
    return [{ ...b, start, end, marked: visible[start].date === b.from }];
  });
  return <div className="practice-chart">
    <div className="practice-ohlc"><strong>{active.date}</strong>{(['open', 'high', 'low', 'close'] as const).map((key, i) => <span key={key}>{['시가', '고가', '저가', '종가'][i]} <b>{number.format(active[key])}</b></span>)}</div>
    <svg ref={svg} viewBox="0 0 880 330" role="img" aria-label={`${candles.length}거래일까지 공개된 주가 캔들 차트. 최근 종가 ${number.format(candles.at(-1)!.close)}원${spans.length ? `. 사건 기간 ${spans.length}개 표시` : ''}`}>
      {[0, 1, 2, 3, 4].map(i => { const price = top - (top - bottom) * i / 4; return <g key={i}><line className="practice-gridline" x1="12" x2="790" y1={y(price)} y2={y(price)} /><text x="806" y={y(price) + 4}>{number.format(Math.round(price))}</text></g>; })}
      {spans.map(s => <rect key={`band-${s.n}`} className={`practice-band ${activeBand === s.n ? 'active' : ''}`} x={x(s.start) - step / 2} y="22" width={(s.end - s.start + 1) * step} height="276" />)}
      {spans.filter(s => s.marked).map(s => <line key={`base-${s.n}`} className="practice-band-base" x1={x(s.start)} x2={x(s.start)} y1="22" y2="298" />)}
      {visible.map((c, i) => <g key={c.date} tabIndex={i === tabStop ? 0 : -1} onFocus={() => setHover(c.date)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(c.date)} onMouseLeave={() => setHover(null)} onKeyDown={e => move(e, i)} aria-label={`${c.date}, 시가 ${c.open}, 고가 ${c.high}, 저가 ${c.low}, 종가 ${c.close}`} className={`practice-candle ${c.close > c.open ? 'candle-up' : c.close < c.open ? 'candle-down' : 'candle-flat'}`}>
        <title>{c.date} · 시가 {number.format(c.open)} · 고가 {number.format(c.high)} · 저가 {number.format(c.low)} · 종가 {number.format(c.close)}</title>
        <rect className="practice-candle-hit" x={x(i) - step / 2} y="12" width={step} height="286" />
        <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} />
        <rect x={x(i) - width / 2} y={Math.min(y(c.open), y(c.close))} width={width} height={Math.max(2, Math.abs(y(c.open) - y(c.close)))} />
      </g>)}
      {spans.filter(s => s.marked).map(s => <g key={`mark-${s.n}`} className={`practice-band-mark ${activeBand === s.n ? 'active' : ''}`} onMouseEnter={() => onActiveBand?.(s.n)} onMouseLeave={() => onActiveBand?.(null)}>
        <title>{`사건 ${s.n} · 공개 기준일 ${s.from}${s.to ? ` ~ 판정일 ${s.to}` : ''}`}</title>
        <rect x={x(s.start) - 9} y="4" width="18" height="16" />
        <text x={x(s.start)} y="16" textAnchor="middle">{s.n}</text>
      </g>)}
      <text x="12" y="320">{visible[0].date}</text><text x="790" y="320" textAnchor="end">{visible.at(-1)!.date}</text>
    </svg>
    <div className="practice-chart-key">{spans.length > 0 && <span className="practice-band-key"><i aria-hidden="true" />사건 기간 · 공개 기준일 ~ 5거래일 뒤 판정일(번호는 선택 기록과 같아요)</span>}<span className="practice-rise">┃ 양봉 · 종가가 시가보다 높음</span><span className="practice-fall">┃ 음봉 · 종가가 시가보다 낮음</span><span>{full ? `전체 ${visible.length}거래일 · ` : candles.length > visible.length ? `최근 ${visible.length}거래일 · ` : ''}일봉 · 원</span></div>
  </div>;
}
