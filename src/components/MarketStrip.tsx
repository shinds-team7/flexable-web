// 투자 인사이트 상단 시장 띠(decisions/2026-10-26-invest-insight-redesign ⑤·⑧). 서버가 준 칸만 순서대로 보인다(수집 전 칸은 서버가 뺀다).
// 오른쪽 → 왼쪽으로 저절로 흐르고 끝까지 가면 이어서 반복한다. 마우스를 올리거나, 키보드 포커스가 띠 안에 있거나, [멈춤]을 누르거나, 탭이 숨겨지면 멈춘다.
// 움직임 줄이기면 흐르지 않고 고정하고, 넘치는 칸은 가로 스크롤로 본다. 이어 붙이려고 복제한 칸은 aria-hidden이라 스크린리더는 목록을 한 번만 읽는다.
// 값·전일 대비·등락률은 모두 서버 값이고 여기서는 표시만 한다. 등락률로 줄을 세우지 않는다(PRD §5).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { IndexItem, IndexStrip } from '@/data/market';
import { useReducedMotion } from '@/lib/motion';
import { won } from '@/lib/format';

/** 1초에 몇 px 흐를지. 글을 읽을 수 있게 느리게 둔다 */
const SPEED = 40;

const dec2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const valueText = (i: IndexItem) => (i.unit === 'KRW_PER_GRAM' ? `${won(i.value)}원/g` : i.unit === 'POINT' ? dec2(i.value) : `${dec2(i.value)}원`);
const changeText = (i: IndexItem) => (i.unit === 'KRW_PER_GRAM' ? won(Math.abs(i.change)) : dec2(Math.abs(i.change)));
const rateText = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(2)}%`;
const md = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

function Cell({ i }: { i: IndexItem }) {
  const dir = i.change > 0 ? 'up' : i.change < 0 ? 'down' : 'flat';
  const word = i.change > 0 ? '올랐어요' : i.change < 0 ? '내렸어요' : '같아요';
  return (
    <li className="ii-strip-cell">
      <span className="sr-only">
        {i.name} {valueText(i)}, 전일보다 {i.change === 0 ? '' : `${changeText(i)} `}
        {word}({rateText(i.changeRate)}), {md(i.date)} 기준
      </span>
      <span className="nm" aria-hidden="true">
        {i.name}
      </span>
      <b className="num" aria-hidden="true">
        {valueText(i)}
      </b>
      <span className={'num ' + dir} aria-hidden="true">
        {dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : ''}
        {changeText(i)} ({rateText(i.changeRate)})
      </span>
      <span className="dt num" aria-hidden="true">
        {md(i.date)}
      </span>
    </li>
  );
}

export function MarketStrip({ data }: { data: IndexStrip }) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const viewRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLUListElement>(null);
  // 한 묶음이 띠 폭을 채우도록 목록을 reps번 잇고, 그 묶음을 두 번 그려 절반(-50%)만큼 흐르면 처음과 같아진다
  const [loop, setLoop] = useState({ reps: 1, seconds: 30 });

  useEffect(() => {
    const on = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  useLayoutEffect(() => {
    if (reduced) return;
    const view = viewRef.current;
    const set = setRef.current;
    if (!view || !set) return;
    const measure = () => {
      const w = set.scrollWidth;
      if (!w) return;
      const reps = Math.max(1, Math.ceil(view.clientWidth / w));
      setLoop((l) => {
        const seconds = Math.max(12, Math.round((w * reps) / SPEED));
        return l.reps === reps && l.seconds === seconds ? l : { reps, seconds };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(view);
    return () => ro.disconnect();
  }, [reduced, data]);

  if (data.items.length === 0) return null;
  const cells = data.items.map((i) => <Cell key={i.key} i={i} />);
  const copies = reduced ? 0 : loop.reps * 2 - 1;
  const stopped = paused || tabHidden;

  return (
    <section className="ii-strip" aria-labelledby="iiStripTitle">
      <h2 id="iiStripTitle" className="sr-only">
        시장 흐름
      </h2>
      <div
        ref={viewRef}
        className={'ii-strip-view' + (reduced ? ' still' : '')}
        role="region"
        aria-label={reduced ? '지수·금·환율' : '지수·금·환율. 마우스를 올리거나 포커스가 있으면 멈춰요'}
        tabIndex={0}
      >
        <div
          className={'ii-strip-track' + (reduced ? '' : ' moving') + (stopped ? ' stopped' : '')}
          style={{ '--ii-strip-dur': `${loop.seconds}s` } as React.CSSProperties}
        >
          <ul ref={setRef} className="ii-strip-set">
            {cells}
          </ul>
          {Array.from({ length: copies }, (_, k) => (
            <ul key={k} className="ii-strip-set" aria-hidden="true">
              {data.items.map((i) => (
                <Cell key={i.key} i={i} />
              ))}
            </ul>
          ))}
        </div>
      </div>
      <div className="ii-strip-foot">
        <p className="meta">
          {data.isSample && <span className="tag-ex">예시</span>} 출처: {data.sources.map((s) => s.name).join(' · ')} · 칸마다 마지막 거래일 기준(전일 대비)
        </p>
        {!reduced && (
          <button type="button" className="btn btn-line btn-sm ii-strip-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
            {/* 이름은 "멈춤"으로 두고 눌림 상태(aria-pressed)로 알린다. 모양만 멈춤 ❚❚ ↔ 재생 ▶ */}
            <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
            멈춤
          </button>
        )}
      </div>
    </section>
  );
}
