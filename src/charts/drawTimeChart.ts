// 타임머신 차트(와이어프레임 drawTimeChart를 옮김). SVG 선 + HTML 버튼 사건 핀, 로빙 tabindex(←/→/Home/End).
// 랜딩 예시와 주식 타임머신 화면이 함께 쓴다. React에서는 TimeChart.tsx로 감싸서 쓴다.
// ADR-4에서 타임머신은 visx로 다시 만들 수 있다. 그때까지 이 구현을 쓴다.
import { EVENTS, N, STOCKS, WEEKS, evChange, type Sim } from '@/data/sampleMarket';
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
const evPeriod = (idx: number) => {
  const s = WEEKS[idx];
  const f = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 4);
  return `${fmtDate(s)} – ${String(f.getMonth() + 1).padStart(2, '0')}.${String(f.getDate()).padStart(2, '0')}`;
};

export type TimeChartOptions = {
  sim: Sim;
  from: number;
  to: number;
  mode: 'total' | 'byStock';
  height?: number;
  compact?: boolean;
  selectedId?: string | null;
  onHover?: () => void;
  onSelect?: (id: string) => void;
  onZoom?: (from: number, to: number) => void;
};

export function drawTimeChart(wrap: HTMLElement, o: TimeChartOptions) {
  wrap.innerHTML = '';
  const W = Math.max(280, wrap.clientWidth);
  const H = o.height || 400;
  const byStock = o.mode === 'byStock';
  const m = { l: 56, r: byStock ? 128 : 16, t: 30, b: 44 };
  const from = Math.max(o.from, o.sim.startIdx);
  const to = o.to;
  const idx: number[] = [];
  for (let i = from; i <= to; i++) idx.push(i);
  const lines = byStock ? [o.sim.vA, o.sim.vB, o.sim.principal.map((v) => v / 2)] : [o.sim.total, o.sim.principal];
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
    svg('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'axis-t' }, s).textContent = krShort(t);
  });
  const span = to - from;
  idx.forEach((i) => {
    const w = WEEKS[i];
    const prev = WEEKS[i - 1];
    let lab: string | null = null;
    if (span > 120) {
      if (prev && w.getFullYear() !== prev.getFullYear()) lab = String(w.getFullYear());
    } else if (prev && w.getMonth() !== prev.getMonth() && w.getMonth() % (span > 40 ? 3 : 1) === 0) lab = fmtYM(w);
    if (lab) svg('text', { x: X(i), y: H - m.b + 20, 'text-anchor': 'middle', class: 'axis-t' }, s).textContent = lab;
  });
  const path = (arr: number[]) => idx.map((i, k) => (k ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(arr[i]).toFixed(1)).join(' ');
  const uid = 'c' + Math.random().toString(36).slice(2, 8);
  if (!byStock) {
    const pr = o.sim.principal;
    const tot = o.sim.total;
    const princPath = path(pr);
    const defs = svg('defs', {}, s);
    const cpA = svg('clipPath', { id: uid + 'a' }, defs);
    svg('path', { d: princPath + ` L${X(to)} ${m.t - 40} L${X(from)} ${m.t - 40} Z` }, cpA);
    const cpB = svg('clipPath', { id: uid + 'b' }, defs);
    svg('path', { d: princPath + ` L${X(to)} ${H} L${X(from)} ${H} Z` }, cpB);
    const band = path(tot) + ' ' + idx.slice().reverse().map((i) => 'L' + X(i).toFixed(1) + ' ' + Y(pr[i]).toFixed(1)).join(' ') + ' Z';
    svg('path', { d: band, 'clip-path': `url(#${uid}a)`, style: 'fill:var(--rise-wash)' }, s);
    svg('path', { d: band, 'clip-path': `url(#${uid}b)`, style: 'fill:var(--fall-wash)' }, s);
    svg('path', { d: princPath, style: 'fill:none;stroke:var(--baseline);stroke-width:1.5;stroke-dasharray:4 4' }, s);
    svg('path', { d: path(tot), style: 'fill:none;stroke:var(--text);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round' }, s);
    svg('circle', { cx: X(to), cy: Y(tot[to]), r: 4.5, style: 'fill:var(--text);stroke:var(--card);stroke-width:2' }, s);
  } else {
    svg('path', { d: path(o.sim.principal.map((v) => v / 2)), style: 'fill:none;stroke:var(--baseline);stroke-width:1.5;stroke-dasharray:4 4' }, s);
    const ends: { k: 'A' | 'B'; y: number; v: number }[] = [];
    (
      [
        ['A', o.sim.vA],
        ['B', o.sim.vB],
      ] as const
    ).forEach(([k, arr]) => {
      svg('path', { d: path(arr), style: `fill:none;stroke:${STOCKS[k].color};stroke-width:2;stroke-linejoin:round` }, s);
      svg('circle', { cx: X(to), cy: Y(arr[to]), r: 4, style: `fill:${STOCKS[k].color};stroke:var(--card);stroke-width:2` }, s);
      ends.push({ k, y: Y(arr[to]), v: arr[to] });
    });
    if (Math.abs(ends[0].y - ends[1].y) >= 30) {
      ends.forEach((e) => {
        svg('text', { x: X(to) + 10, y: e.y - 2, class: 'axis-t', style: 'fill:var(--text);font-weight:600' }, s).textContent = STOCKS[e.k].name;
        svg('text', { x: X(to) + 10, y: e.y + 14, class: 'axis-t' }, s).textContent = won(e.v) + '원';
      });
    }
  }
  const sel = EVENTS.find((e) => e.id === o.selectedId);
  if (sel && sel.idx >= from && sel.idx <= to)
    svg('line', { x1: X(sel.idx), x2: X(sel.idx), y1: m.t - 10, y2: H - m.b, style: 'stroke:var(--text);stroke-width:1;opacity:.4' }, s);

  // 크로스헤어·툴팁
  const cross = svg('line', { y1: m.t, y2: H - m.b, style: 'stroke:var(--text-muted);stroke-width:1', visibility: 'hidden' }, s);
  const dot = svg('circle', { r: 4.5, style: 'fill:var(--text);stroke:var(--card);stroke-width:2', visibility: 'hidden' }, s);
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
    const mainArr = byStock ? o.sim.vA : o.sim.total;
    dot.setAttribute('cx', String(X(k)));
    dot.setAttribute('cy', String(Y(mainArr[k])));
    dot.setAttribute('visibility', byStock ? 'hidden' : 'visible');
    tip.replaceChildren(h('div', { cls: 'meta', text: fmtDate(WEEKS[k]) + ' 주' }));
    if (!byStock) {
      const v = o.sim.total[k];
      const p = o.sim.principal[k];
      const d = v - p;
      tip.append(
        h('div', { cls: 't-val num', text: won(v) + '원' }),
        row('var(--baseline)', '넣은 돈', won(p) + '원'),
        h('div', { cls: 't-row' }, h('span', { text: '차이' }), h('b', { cls: 'num ' + cls(d), text: `${arrow(d)} ${signWon(d)}` })),
      );
    } else {
      tip.append(
        row(STOCKS.A.color, STOCKS.A.name, won(o.sim.vA[k]) + '원', true),
        row(STOCKS.B.color, STOCKS.B.name, won(o.sim.vB[k]) + '원', true),
        row('var(--baseline)', '종목당 넣은 돈', won(o.sim.principal[k] / 2) + '원'),
      );
    }
    placeTip(X(k), byStock ? m.t + 40 : Y(mainArr[k]));
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });

  // 사건 핀(HTML 버튼). 24px 안에 붙은 핀은 묶음, 8묶음이 넘으면 큰 움직임 순으로 8개만.
  const layer = h('div', { cls: 'pins' });
  wrap.append(layer);
  const vis = EVENTS.filter((e) => e.idx >= from && e.idx <= to && e.idx > o.sim.startIdx);
  const lineFor = (e: (typeof EVENTS)[number]) => (byStock ? (e.stock === 'B' ? o.sim.vB : o.sim.vA) : o.sim.total);
  const groups: { x0: number; items: typeof EVENTS }[] = [];
  vis.forEach((e) => {
    const x = X(e.idx);
    const g = groups[groups.length - 1];
    if (g && x - g.x0 < 24) g.items.push(e);
    else groups.push({ x0: x, items: [e] });
  });
  let shown = groups;
  if (groups.length > 8) {
    const score = (g: (typeof groups)[number]) => Math.max(...g.items.map((e) => Math.abs(evChange(e, o.sim).p)));
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
    const b = h('button', { cls: 'pin ' + (cluster ? 'cluster ' : '') + kind, type: 'button', tabindex: '-1' }) as HTMLButtonElement;
    b.style.left = x + 'px';
    b.style.top = y + 'px';
    b.append(h('span', { cls: 'dot', 'aria-hidden': 'true', text: cluster ? String(items.length) : kind === 'rise' ? '▲' : kind === 'fall' ? '▼' : 'i' }));
    svg('line', { x1: x, x2: x, y1: yv, y2: y + (y > yv ? -9 : 9), style: 'stroke:var(--text-muted);stroke-width:1;pointer-events:none' }, s);
    if (cluster) {
      b.setAttribute('aria-label', `사건 ${items.length}개 묶음, ${fmtYM(WEEKS[items[0].idx])}부터 ${fmtYM(WEEKS[items[items.length - 1].idx])}. 누르면 이 기간을 확대해요`);
    } else {
      const c = evChange(ref, o.sim);
      const kTxt = ref.kind === 'rise' ? '급등' : ref.kind === 'fall' ? '급락' : '참고';
      b.setAttribute('aria-label', `${kTxt}, ${fmtDate(WEEKS[ref.idx])}, ${ref.title}${ref.kind !== 'info' ? ', ' + pctTxt(c.p) : ''}. 눌러서 자세히`);
      if (o.selectedId === ref.id) b.setAttribute('aria-pressed', 'true');
    }
    const show = () => {
      tip.replaceChildren();
      if (cluster) {
        tip.append(h('div', { cls: 't-title', text: `사건 ${items.length}개가 가까이 있어요` }));
        items.forEach((e) => {
          const c = evChange(e, o.sim);
          tip.append(h('div', { cls: 't-row' }, h('span', { text: `${fmtYM(WEEKS[e.idx])} ${e.title}` }), h('b', { cls: 'num ' + cls(c.p), text: `${arrow(c.p)}${pctTxt(c.p)}` })));
        });
        tip.append(h('div', { cls: 't-more', text: '눌러서 이 기간 확대' }));
      } else {
        const c = evChange(ref, o.sim);
        if (ref.kind !== 'info') tip.append(h('div', { cls: 't-val num ' + cls(c.p), text: `${arrow(c.p)} ${pctTxt(c.p)} · 5거래일` }));
        tip.append(h('div', { cls: 't-title', text: ref.title }));
        tip.append(h('div', { text: `${evPeriod(ref.idx)} · ${ref.stock === 'all' ? '시장 전체' : STOCKS[ref.stock].name}` }));
        if (ref.kind !== 'info' && c.before > 0) tip.append(h('div', {}, '이때 내 돈 ', h('b', { cls: 'num', style: 'color:var(--text)', text: signWon(c.diff) })));
        tip.append(h('div', { cls: 'meta', text: '출처: ' + ref.sources[0].s + ' (예시)' }));
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
      if (cluster) o.onZoom?.(Math.max(0, items[0].idx - 6), Math.min(N - 1, items[items.length - 1].idx + 8));
      else o.onSelect?.(ref.id);
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
