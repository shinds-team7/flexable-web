import { useState } from 'react';
import type { Candle } from '@/data/practice';

const number = new Intl.NumberFormat('ko-KR');
export function CandleChart({ candles }: { candles: Candle[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const visible = candles.slice(-60);
  const active = visible.find(c => c.date === hover) ?? visible.at(-1);
  if (!active) return <div className="practice-chart-empty"><span className="practice-empty-icon">▥</span><h3>나의 선택으로 이어지는 차트</h3><p>업종과 금액을 정하고 연습을 시작해 보세요.</p><p>하루씩 시세를 살펴보다 사건이 나오면 선택할 수 있어요.</p></div>;
  const low = Math.min(...visible.map(c => c.low)), high = Math.max(...visible.map(c => c.high));
  const range = Math.max(high - low, high * 0.04, 1);
  const top = high + range * .14, bottom = low - range * .14;
  const y = (value: number) => 24 + (top - value) / (top - bottom) * 266;
  const step = 760 / Math.max(30, visible.length), width = Math.max(3, step * .58);
  return <div className="practice-chart">
    <div className="practice-ohlc"><strong>{active.date}</strong>{(['open', 'high', 'low', 'close'] as const).map((key, i) => <span key={key}>{['시가', '고가', '저가', '종가'][i]} <b>{number.format(active[key])}</b></span>)}</div>
    <svg viewBox="0 0 880 330" role="img" aria-label={`${candles.length}거래일까지 공개된 주가 캔들 차트. 최근 종가 ${number.format(candles.at(-1)!.close)}원`}>
      {[0, 1, 2, 3, 4].map(i => { const price = top - (top - bottom) * i / 4; return <g key={i}><line className="practice-gridline" x1="12" x2="790" y1={y(price)} y2={y(price)} /><text x="806" y={y(price) + 4}>{number.format(Math.round(price))}</text></g>; })}
      {visible.map((c, i) => { const x = 24 + i * step; return <g key={c.date} tabIndex={0} onFocus={() => setHover(c.date)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(c.date)} onMouseLeave={() => setHover(null)} aria-label={`${c.date}, 시가 ${c.open}, 고가 ${c.high}, 저가 ${c.low}, 종가 ${c.close}`} className={`practice-candle ${c.close > c.open ? 'candle-up' : c.close < c.open ? 'candle-down' : 'candle-flat'}`}>
        <title>{c.date} · 시가 {number.format(c.open)} · 고가 {number.format(c.high)} · 저가 {number.format(c.low)} · 종가 {number.format(c.close)}</title>
        <rect className="practice-candle-hit" x={x - step / 2} y="12" width={step} height="286" />
        <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} />
        <rect x={x - width / 2} y={Math.min(y(c.open), y(c.close))} width={width} height={Math.max(2, Math.abs(y(c.open) - y(c.close)))} />
      </g>; })}
      <text x="12" y="320">{visible[0].date}</text><text x="790" y="320" textAnchor="end">{visible.at(-1)!.date}</text>
    </svg>
    <div className="practice-chart-key"><span className="practice-rise">┃ 양봉 · 종가가 시가보다 높음</span><span className="practice-fall">┃ 음봉 · 종가가 시가보다 낮음</span><span>일봉 · 원</span></div>
  </div>;
}
