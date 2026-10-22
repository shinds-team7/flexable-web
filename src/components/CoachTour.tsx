// 사용법 둘러보기(코치마크). [사용법 보기]를 누른 사람에게만 연다(01-product F5-4, 02-design §1-6).
// 한 번에 한 곳만 밝히고, 메모지는 실제 UI와 다른 손글씨 모양(.coach-note)으로 그린다. 화면에 없는 대상은 건너뛴다.
// Esc·[건너뛰기]로 닫고, 닫으면 열기 전 포커스로 돌아간다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type CoachStep = { target: () => HTMLElement | null; title: string; body: string };

const NOTE_W = 300;
const NOTE_H = 190; // 메모지 대략 높이. 아래·위 어디에 둘지 고를 때만 쓴다
const GAP = 12;
const PAD = 6; // 밝힌 곳 둘레 여유

export function CoachTour({ steps, onClose }: { steps: CoachStep[]; onClose: () => void }) {
  // 열 때 화면에 있는 대상만 남긴다
  const [list] = useState(() => steps.filter((s) => s.target()));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(document.activeElement);
  const step = list[i];

  useEffect(() => {
    if (list.length === 0) onClose();
    const back = returnTo.current;
    return () => {
      if (back instanceof HTMLElement) back.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = step?.target();
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  // 포커스가 메모지 밖에 있어도 Esc로 닫는다
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, []);

  // 메모지는 대상 위치를 잰 뒤에 그려지므로 그때 [다음]으로 포커스를 옮긴다
  const shown = rect != null;
  useEffect(() => {
    if (shown) noteRef.current?.querySelector<HTMLButtonElement>('button.go')?.focus();
  }, [i, shown]);

  if (!step || !rect) return null;
  const last = i === list.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(16, Math.min(vw - NOTE_W - 16, rect.left));
  // 아래에 자리가 있으면 아래, 없으면 위, 둘 다 없으면(대상이 화면보다 큼) 대상 안쪽 위에 둔다
  const top =
    rect.bottom + GAP + NOTE_H < vh ? rect.bottom + GAP
    : rect.top - GAP - NOTE_H > 0 ? rect.top - GAP - NOTE_H
    : Math.max(16, rect.top + GAP);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const f = Array.from(noteRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      const at = f.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    }
  };

  return createPortal(
    <>
      <div
        className="coach-spot"
        style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        aria-hidden="true"
      />
      <div ref={noteRef} className="coach-note" role="dialog" aria-modal="true" aria-labelledby="coachTitle" style={{ left, top }} onKeyDown={onKey}>
        <p className="coach-step">
          {i + 1} / {list.length}
        </p>
        <h3 id="coachTitle">{step.title}</h3>
        <p>{step.body}</p>
        <div className="row">
          <button type="button" onClick={onClose}>
            건너뛰기
          </button>
          <span className="coach-nav">
            <button type="button" disabled={i === 0} onClick={() => setI(i - 1)}>
              이전
            </button>
            <button type="button" className="go" onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? '시작하기' : '다음'}
            </button>
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}
