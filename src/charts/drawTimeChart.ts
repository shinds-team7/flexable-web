// 타임머신 차트(와이어프레임 drawTimeChart를 옮김). SVG 선 + HTML 버튼 사건 핀, 로빙 tabindex(←/→/Home/End).
// 랜딩 예시(sampleChartData)와 투자 인사이트 주가 차트(mode 'price', 서버가 준 일별 종가)가 함께 쓴다. React에서는 TimeChart.tsx로 감싸서 쓴다.
// 차트는 받은 값을 그리기만 한다(금액 계산 없음). ADR-4에서 타임머신은 visx로 다시 만들 수 있다. 그때까지 이 구현을 쓴다.
import { arrow, fmtDate, fmtYM, krShort, niceTicks, pctTxt, signWon, won } from '@/lib/format';

const NS = 'http://www.w3.org/2000/svg';
const cls = (x: number) => (x >= 0 ? 'up' : 'down');

function svg(tag: string, attrs: Record<string, string | number> = {}, parent?: Element) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}
type Props = Record<string, string | null | undefined | false> & { text?: string; cls?: string };
function h(tag: string, props: Props = {}, ...kids: (Node | string | null)[]) {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'cls') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}

/** 차트 한 줄(종목). values·invested는 점마다 원 단위. */
export type ChartLeg = { name: string; color: string; values: number[]; invested: number[] };

/**
 * 종목별 보기의 표식 모양(줄 순서대로). 범주색이 같은 블루 계열이라 색만으로 구분하지 않게 모양을 함께 쓴다(02 §6-1·§7-1).
 * 범례(SeriesKey)도 같은 순서를 쓴다.
 */
export const SERIES_MARKS = ['circle', 'square', 'diamond', 'triangle', 'circle'] as const;
export type SeriesMark = (typeof SERIES_MARKS)[number];

/** 표식 하나(SVG). r은 대략의 반지름(px). */
export function seriesMark(shape: SeriesMark, x: number, y: number, color: string, r = 4.5, parent?: Element) {
  const style = `fill:${color};stroke:var(--card);stroke-width:1.5`;
  if (shape === 'square') return svg('rect', { x: x - r * 0.85, y: y - r * 0.85, width: r * 1.7, height: r * 1.7, style }, parent);
  if (shape === 'diamond') return svg('path', { d: `M${x} ${y - r * 1.2}L${x + r * 1.2} ${y}L${x} ${y + r * 1.2}L${x - r * 1.2} ${y}Z`, style }, parent);
  if (shape === 'triangle') return svg('path', { d: `M${x} ${y - r * 1.2}L${x + r * 1.1} ${y + r * 0.8}L${x - r * 1.1} ${y + r * 0.8}Z`, style }, parent);
  return svg('circle', { cx: x, cy: y, r, style }, parent);
}
/**
 * 사건 핀. change는 사건 기간 등락률(p)과 그때 내 돈 변화(diff, 넣은 돈 제외). leg는 종목 줄 번호, null이면 시장 전체.
 * days·period를 주면 툴팁에 그대로 쓰고(서버 사건), 없으면 그 주 5거래일로 본다(랜딩 예시).
 */
export type ChartEvent = {
  id: string;
  idx: number;
  kind: 'rise' | 'fall' | 'info';
  title: string;
  leg: number | null;
  sourceName: string;
  change: { p: number; before: number; diff: number };
  days?: number;
  period?: string;
};
export type ChartData = {
  dates: Date[]; // 점마다 x축 날짜(주 시작일, price 모드는 거래일)
  heads?: string[]; // 툴팁 머리. 없으면 "YYYY.MM.DD 주"
  tipTitle?: string;
  total: number[]; // price 모드는 종가(원)
  invested: number[]; // price 모드는 쓰지 않는다(빈 배열)
  legs: ChartLeg[];
  startIdx: number;
  events: ChartEvent[];
};

const evPeriod = (dates: Date[], idx: number) => {
  const s = dates[idx];
  const f = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 4);
  return `${fmtDate(s)} – ${String(f.getMonth() + 1).padStart(2, '0')}.${String(f.getDate()).padStart(2, '0')}`;
};

export type TimeChartOptions = {
  data: ChartData;
  from: number;
  to: number;
  /** total: 내 자산·넣은 돈, byStock: 종목별, price: 주가(원) 한 줄(세로축 = 종가) */
  mode: 'total' | 'byStock' | 'price';
  height?: number;
  /** 선이 왼쪽부터 그려진다(RevealClip과 같은 .reveal-rect). 사건 핀은 선을 다 그린 뒤 나타난다(.pins-wait). 움직임 줄이기면 global.css가 애니메이션을 끈다 */
  reveal?: boolean;
  /** price 모드: 선 아래를 브랜드 색으로 채우고 바닥으로 갈수록 연하게(그라데이션). reveal이면 선을 다 그린 뒤 나타난다(.area-wait) */
  area?: boolean;
  compact?: boolean;
  selectedId?: string | null;
  onHover?: () => void;
  onSelect?: (id: string) => void;
  onZoom?: (from: number, to: number) => void;
  /** 묶음 핀을 더 확대해도 풀 수 없을 때(같은 주에 겹친 사건 등) 그 사건들의 id. 없으면 첫 사건을 고른다. */
  onPickMany?: (ids: string[]) => void;
};

export function drawTimeChart(wrap: HTMLElement, o: TimeChartOptions) {
  wrap.innerHTML = '';
  const d = o.data;
  const WEEKS = d.dates;
  const N = WEEKS.length;
  const EVENTS = d.events;
  const W = Math.max(280, wrap.clientWidth);
  const H = o.height || 400;
  const byStock = o.mode === 'byStock';
  const price = o.mode === 'price';
  const m = { l: price ? 64 : 56, r: byStock ? 128 : 16, t: 30, b: 44 };
  const from = Math.max(o.from, d.startIdx);
  const to = Math.min(o.to, N - 1);
  const idx: number[] = [];
  for (let i = from; i <= to; i++) idx.push(i);
  const lines = byStock ? d.legs.flatMap((l) => [l.values, l.invested]) : price ? [d.total] : [d.total, d.invested];
  let lo = Infinity;
  let hi = -Infinity;
  idx.forEach((i) => lines.forEach((s) => ((lo = Math.min(lo, s[i])), (hi = Math.max(hi, s[i])))));
  const pad = (hi - lo) * 0.12 || hi * 0.1;
  const ticks = niceTicks(Math.max(0, lo - pad), hi + pad, o.compact ? 3 : 4);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const X = (i: number) => m.l + ((i - from) / Math.max(1, to - from)) * (W - m.l - m.r);
  const Y = (v: number) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const s = svg('svg', { width: W, height: H, role: 'img', 'aria-hidden': 'true' }, wrap) as SVGSVGElement;
  ticks.forEach((t) => {
    svg('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid-l' }, s);
    svg('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'axis-t' }, s).textContent = price ? won(t) : krShort(t);
  });
  const span = to - from;
  // price 모드(거래일 점)는 달력 날짜 폭으로 눈금을 정한다: 2년 넘으면 해마다, 10개월 넘으면 석 달마다, 그 밖에는 달마다
  const days = (WEEKS[to].getTime() - WEEKS[from].getTime()) / 86_400_000;
  idx.forEach((i) => {
    const w = WEEKS[i];
    const prev = WEEKS[i - 1];
    let lab: string | null = null;
    if (price) {
      if (prev && days > 730 && w.getFullYear() !== prev.getFullYear()) lab = String(w.getFullYear());
      else if (prev && days <= 730 && w.getMonth() !== prev.getMonth() && w.getMonth() % (days > 300 ? 3 : 1) === 0) lab = fmtYM(w);
    } else if (span > 120) {
      if (prev && w.getFullYear() !== prev.getFullYear()) lab = String(w.getFullYear());
    } else if (prev && w.getMonth() !== prev.getMonth() && w.getMonth() % (span > 40 ? 3 : 1) === 0) lab = fmtYM(w);
    if (lab) svg('text', { x: X(i), y: H - m.b + 20, 'text-anchor': 'middle', class: 'axis-t' }, s).textContent = lab;
  });
  const path = (arr: number[]) => idx.map((i, k) => (k ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(arr[i]).toFixed(1)).join(' ');
  const uid = 'c' + Math.random().toString(36).slice(2, 8);
  // 선을 담는 곳. reveal이면 왼쪽부터 드러나는 clipPath 안에 그린다(축·격자·핀은 그대로)
  let plot: Element = s;
  if (o.reveal) {
    const cp = svg('clipPath', { id: uid + 'r' }, svg('defs', {}, s));
    svg('rect', { class: 'reveal-rect', x: 0, y: 0, width: W, height: H }, cp);
    plot = svg('g', { 'clip-path': `url(#${uid}r)` }, s);
  }
  if (price) {
    if (o.area) {
      // 선 아래 면. 위(선의 가장 높은 곳)는 브랜드 색 18%, 바닥은 투명. 선보다 뒤에 깔고, 선 그리기 clip 밖이라 따로 나타난다
      const grad = svg('linearGradient', { id: uid + 'g', x1: 0, y1: 0, x2: 0, y2: 1 }, svg('defs', {}, s));
      svg('stop', { offset: '0%', style: 'stop-color:var(--brand);stop-opacity:.18' }, grad);
      svg('stop', { offset: '100%', style: 'stop-color:var(--brand);stop-opacity:0' }, grad);
      const area = svg('path', {
        d: path(d.total) + ` L${X(to).toFixed(1)} ${H - m.b} L${X(from).toFixed(1)} ${H - m.b} Z`,
        style: `fill:url(#${uid}g);stroke:none;pointer-events:none`,
        ...(o.reveal ? { class: 'area-wait' } : {}),
      });
      s.insertBefore(area, plot === s ? null : plot);
    }
    // 선·끝점은 아래 면과 같은 브랜드 색(차트 계열 1번)
    svg('path', { d: path(d.total), style: 'fill:none;stroke:var(--brand);stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }, plot);
    svg('circle', { cx: X(to), cy: Y(d.total[to]), r: 4.5, style: 'fill:var(--brand);stroke:var(--card);stroke-width:2' }, plot);
  } else if (!byStock) {
    const pr = d.invested;
    const tot = d.total;
    const princPath = path(pr);
    const defs = svg('defs', {}, s);
    const cpA = svg('clipPath', { id: uid + 'a' }, defs);
    svg('path', { d: princPath + ` L${X(to)} ${m.t - 40} L${X(from)} ${m.t - 40} Z` }, cpA);
    const cpB = svg('clipPath', { id: uid + 'b' }, defs);
    svg('path', { d: princPath + ` L${X(to)} ${H} L${X(from)} ${H} Z` }, cpB);
    const band = path(tot) + ' ' + idx.slice().reverse().map((i) => 'L' + X(i).toFixed(1) + ' ' + Y(pr[i]).toFixed(1)).join(' ') + ' Z';
    svg('path', { d: band, 'clip-path': `url(#${uid}a)`, style: 'fill:var(--rise-wash)' },plot);
    svg('path', { d: band, 'clip-path': `url(#${uid}b)`, style: 'fill:var(--fall-wash)' },plot);
    svg('path', { d: princPath, style: 'fill:none;stroke:var(--baseline);stroke-width:1.5;stroke-dasharray:4 4' },plot);
    svg('path', { d: path(tot), style: 'fill:none;stroke:var(--text);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round' },plot);
    svg('circle', { cx: X(to), cy: Y(tot[to]), r: 4.5, style: 'fill:var(--text);stroke:var(--card);stroke-width:2' },plot);
  } else {
    // 종목별 넣은 돈(비율이 다르면 줄마다 다르다): 그 종목 색 점선
    d.legs.forEach((leg) => svg('path', { d: path(leg.invested), style: `fill:none;stroke:${leg.color};stroke-width:1.2;stroke-dasharray:4 4;opacity:.55` }, plot));
    const ends: { leg: ChartLeg; y: number; v: number }[] = [];
    // 표식 간격: 화면에 7개 안팎
    const step = Math.max(1, Math.ceil(idx.length / 7));
    d.legs.forEach((leg, j) => {
      const arr = leg.values;
      // 선이 겹치는 곳에서도 구분되게 바탕색 테두리를 먼저 깐다
      svg('path', { d: path(arr), style: 'fill:none;stroke:var(--card);stroke-width:5;stroke-linejoin:round;opacity:.9' }, plot);
      svg('path', { d: path(arr), style: `fill:none;stroke:${leg.color};stroke-width:${j === 0 ? 2.5 : 2};stroke-linejoin:round` }, plot);
      const shape = SERIES_MARKS[j % SERIES_MARKS.length];
      idx.forEach((i, k) => {
        if (k % step === Math.floor(step / 2) && i !== to) seriesMark(shape, X(i), Y(arr[i]), leg.color, 3.5, plot);
      });
      seriesMark(shape, X(to), Y(arr[to]), leg.color, 5, plot);
      ends.push({ leg, y: Y(arr[to]), v: arr[to] });
    });
    // 끝 이름표는 서로 30px 넘게 떨어져 있을 때만 단다(겹치면 범례·툴팁으로 본다).
    const ys = ends.map((e) => e.y).sort((a, b) => a - b);
    if (ys.every((y, i) => i === 0 || y - ys[i - 1] >= 30)) {
      ends.forEach((e) => {
        svg('text', { x: X(to) + 10, y: e.y - 2, class: 'axis-t', style: 'fill:var(--text);font-weight:600' }, s).textContent = e.leg.name;
        svg('text', { x: X(to) + 10, y: e.y + 14, class: 'axis-t' }, s).textContent = won(e.v) + '원';
      });
    }
  }
  const sel = EVENTS.find((e) => e.id === o.selectedId);
  if (sel && sel.idx >= from && sel.idx <= to)
    svg('line', { x1: X(sel.idx), x2: X(sel.idx), y1: m.t - 10, y2: H - m.b, style: 'stroke:var(--text);stroke-width:1;opacity:.4' }, s);

  // 크로스헤어·툴팁
  const cross = svg('line', { y1: m.t, y2: H - m.b, style: 'stroke:var(--text-muted);stroke-width:1', visibility: 'hidden' }, s);
  const dot = svg('circle', { r: 4.5, style: `fill:var(${price ? '--brand' : '--text'});stroke:var(--card);stroke-width:2`, visibility: 'hidden' }, s);
  // 종목별 보기: 마우스 위치의 종목마다 표식
  const legDots = byStock ? d.legs.map(() => svg('g', { visibility: 'hidden', style: 'pointer-events:none' }, s)) : [];
  const hit = svg('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, style: 'fill:transparent' }, s);
  const tip = h('div', { cls: 'tip', hidden: '' });
  wrap.append(tip);
  const placeTip = (x: number, y: number) => {
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = x + 14;
    if (left + tw > W) left = x - tw - 14;
    if (left < 0) left = 4;
    let top = y - th - 14;
    if (top < 0) top = y + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };
  const row = (key: string | null, label: string, val: string, strong?: boolean) =>
    h(
      'div',
      { cls: 't-row' },
      h('span', {}, key ? h('i', { cls: 't-key', style: `border-color:${key}` + (key === 'var(--baseline)' ? ';border-top-style:dashed' : '') }) : null, label),
      strong ? h('b', { cls: 'num', text: val }) : h('span', { cls: 'num', text: val }),
    );
  hit.addEventListener('pointermove', (ev) => {
    const r = s.getBoundingClientRect();
    const px = (ev as PointerEvent).clientX - r.left;
    const k = Math.max(from, Math.min(to, Math.round(from + ((px - m.l) / (W - m.l - m.r)) * (to - from))));
    cross.setAttribute('x1', String(X(k)));
    cross.setAttribute('x2', String(X(k)));
    cross.setAttribute('visibility', 'visible');
    const mainArr = byStock ? (d.legs[0]?.values ?? d.total) : d.total;
    dot.setAttribute('cx', String(X(k)));
    dot.setAttribute('cy', String(Y(mainArr[k])));
    dot.setAttribute('visibility', byStock ? 'hidden' : 'visible');
    tip.replaceChildren();
    if (d.tipTitle) tip.append(h('div', { cls: 't-title', text: d.tipTitle }));
    tip.append(h('div', { cls: 'meta', text: d.heads?.[k] ?? fmtDate(WEEKS[k]) + ' 주' }));
    if (price) {
      tip.append(h('div', { cls: 't-val num', text: won(d.total[k]) + '원' }));
    } else if (!byStock) {
      const v = d.total[k];
      const p = d.invested[k];
      const gap = v - p;
      tip.append(
        h('div', { cls: 't-val num', text: won(v) + '원' }),
        row('var(--baseline)', '넣은 돈', won(p) + '원'),
        h('div', { cls: 't-row' }, h('span', { text: '차이' }), h('b', { cls: 'num ' + cls(gap), text: `${arrow(gap)} ${signWon(gap)}` })),
      );
    } else {
      legDots.forEach((g, j) => {
        g.replaceChildren();
        seriesMark(SERIES_MARKS[j % SERIES_MARKS.length], X(k), Y(d.legs[j].values[k]), d.legs[j].color, 5, g);
        g.setAttribute('visibility', 'visible');
      });
      d.legs.forEach((leg) => {
        tip.append(row(leg.color, leg.name, won(leg.values[k]) + '원', true));
        tip.append(h('div', { cls: 't-row meta' }, h('span', { text: '　넣은 돈' }), h('span', { cls: 'num', text: won(leg.invested[k]) + '원' })));
      });
    }
    placeTip(X(k), byStock ? m.t + 40 : Y(mainArr[k]));
  });
  hit.addEventListener('pointerleave', () => {
    legDots.forEach((g) => g.setAttribute('visibility', 'hidden'));
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });

  // 사건 핀(HTML 버튼). 24px 안에 붙은 핀은 묶음, 8묶음이 넘으면 큰 움직임 순으로 8개만.
  // reveal이면 핀과 핀을 잇는 선을 선 그리기가 끝난 뒤에 보인다(그 전에는 숨겨서 누르거나 포커스할 수 없다)
  const layer = h('div', { cls: 'pins' + (o.reveal ? ' pins-wait' : '') });
  const stems = o.reveal ? svg('g', { class: 'pins-wait' }, s) : s;
  wrap.append(layer);
  const vis = EVENTS.filter((e) => e.idx >= from && e.idx <= to && e.idx > d.startIdx);
  const lineFor = (e: ChartEvent) => (byStock ? (d.legs[e.leg ?? 0]?.values ?? d.total) : d.total);
  const groups: { x0: number; items: typeof EVENTS }[] = [];
  vis.forEach((e) => {
    const x = X(e.idx);
    const g = groups[groups.length - 1];
    if (g && x - g.x0 < 24) g.items.push(e);
    else groups.push({ x0: x, items: [e] });
  });
  let shown = groups;
  if (groups.length > 8) {
    const score = (g: (typeof groups)[number]) => Math.max(...g.items.map((e) => Math.abs(e.change.p)));
    shown = groups.slice().sort((a, b) => score(b) - score(a)).slice(0, 8).sort((a, b) => a.x0 - b.x0);
  }
  const btns: HTMLButtonElement[] = [];
  shown.forEach((g) => {
    const items = g.items;
    const x = items.map((e) => X(e.idx)).reduce((a, b) => a + b, 0) / items.length;
    const kinds = new Set(items.map((e) => e.kind));
    const kind = kinds.size === 1 ? [...kinds][0] : 'mixed';
    const ref = items[Math.floor(items.length / 2)];
    const yv = Y(lineFor(ref)[ref.idx]);
    const y = Math.max(m.t - 16, Math.min(H - m.b + 6, kind === 'fall' ? yv + 22 : yv - 22));
    const cluster = items.length > 1;
    // 묶음을 누르면 확대: 앞뒤 여유를 두고, 이미 그만큼 확대돼 있으면 더 좁게. 같은 주에 겹쳐 확대로 풀 수 없으면 사건 고르기
    const first = items[0].idx;
    const last = items[items.length - 1].idx;
    const zoomTo = [
      [Math.max(0, first - 6), Math.min(N - 1, last + 8)],
      [Math.max(0, first - 2), Math.min(N - 1, last + 2)],
    ].find(([a, b]) => b - a < to - from);
    const canZoom = cluster && first !== last && zoomTo != null;
    const b = h('button', { cls: 'pin ' + (cluster ? 'cluster ' : '') + kind, type: 'button', tabindex: '-1' }) as HTMLButtonElement;
    b.style.left = x + 'px';
    b.style.top = y + 'px';
    b.append(h('span', { cls: 'dot', 'aria-hidden': 'true', text: cluster ? String(items.length) : kind === 'rise' ? '▲' : kind === 'fall' ? '▼' : 'i' }));
    svg('line', { x1: x, x2: x, y1: yv, y2: y + (y > yv ? -9 : 9), style: 'stroke:var(--text-muted);stroke-width:1;pointer-events:none' }, stems);
    if (cluster) {
      b.setAttribute(
        'aria-label',
        `사건 ${items.length}개 묶음, ${fmtYM(WEEKS[first])}부터 ${fmtYM(WEEKS[last])}. ${canZoom ? '누르면 이 기간을 확대해요' : '누르면 사건을 골라 볼 수 있어요'}`,
      );
    } else {
      const c = ref.change;
      const kTxt = ref.kind === 'rise' ? '급등' : ref.kind === 'fall' ? '급락' : '참고';
      b.setAttribute('aria-label', `${kTxt}, ${fmtDate(WEEKS[ref.idx])}, ${ref.title}${ref.kind !== 'info' ? ', ' + pctTxt(c.p) : ''}. 눌러서 자세히`);
      if (o.selectedId === ref.id) b.setAttribute('aria-pressed', 'true');
    }
    const show = () => {
      tip.replaceChildren();
      if (cluster) {
        tip.append(h('div', { cls: 't-title', text: `사건 ${items.length}개가 가까이 있어요` }));
        items.forEach((e) => {
          const c = e.change;
          tip.append(h('div', { cls: 't-row' }, h('span', { text: `${fmtYM(WEEKS[e.idx])} ${e.title}` }), h('b', { cls: 'num ' + cls(c.p), text: `${arrow(c.p)}${pctTxt(c.p)}` })));
        });
        tip.append(h('div', { cls: 't-more', text: canZoom ? '눌러서 이 기간 확대' : '눌러서 사건 고르기' }));
      } else {
        const c = ref.change;
        if (ref.kind !== 'info') tip.append(h('div', { cls: 't-val num ' + cls(c.p), text: `${arrow(c.p)} ${pctTxt(c.p)} · ${ref.days ?? 5}거래일` }));
        tip.append(h('div', { cls: 't-title', text: ref.title }));
        tip.append(h('div', { text: `${ref.period ?? evPeriod(WEEKS, ref.idx)} · ${ref.leg == null ? '시장 전체' : (d.legs[ref.leg]?.name ?? '')}` }));
        if (ref.kind !== 'info' && c.before > 0) tip.append(h('div', {}, '이때 내 돈 ', h('b', { cls: 'num', style: 'color:var(--text)', text: signWon(c.diff) })));
        if (ref.sourceName) tip.append(h('div', { cls: 'meta', text: '출처: ' + ref.sourceName }));
        tip.append(h('div', { cls: 't-more', text: '눌러서 이유 보기' }));
      }
      placeTip(x, y);
      o.onHover?.();
    };
    b.addEventListener('mouseenter', show);
    b.addEventListener('focus', show);
    b.addEventListener('mouseleave', () => (tip.hidden = true));
    b.addEventListener('blur', () => (tip.hidden = true));
    b.addEventListener('click', () => {
      if (canZoom && zoomTo) o.onZoom?.(zoomTo[0], zoomTo[1]);
      else if (cluster && o.onPickMany) o.onPickMany(items.map((e) => e.id));
      else o.onSelect?.(cluster ? items[0].id : ref.id);
    });
    layer.append(b);
    btns.push(b);
  });
  const selBtn = btns.find((b) => b.getAttribute('aria-pressed') === 'true') || btns[0];
  if (selBtn) selBtn.tabIndex = 0;
  layer.addEventListener('keydown', (ev) => {
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let n: number | null = null;
    if (ev.key === 'ArrowRight') n = Math.min(btns.length - 1, i + 1);
    else if (ev.key === 'ArrowLeft') n = Math.max(0, i - 1);
    else if (ev.key === 'Home') n = 0;
    else if (ev.key === 'End') n = btns.length - 1;
    if (n != null) {
      ev.preventDefault();
      btns.forEach((b) => (b.tabIndex = -1));
      btns[n].tabIndex = 0;
      btns[n].focus();
    }
  });
  return { shownCount: shown.reduce((a, g) => a + g.items.length, 0), visCount: vis.length, btns };
}
