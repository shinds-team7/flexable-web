// 페이지를 내릴 때 영역이 화면에 처음 들어오면 한 번 나타난다(투명도 + 짧은 이동, 280ms). 다시 숨기지 않는다.
// 투자 인사이트(/invest)에만 쓴다(02 §7-3 예외, decisions/2026-10-26-invest-insight-redesign ⑧).
// 움직임 줄이기면 처음부터 보인다. 내용은 숨겨진 동안에도 스크린리더가 읽을 수 있다(투명도만 바꾼다).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion';

export function Reveal({ children, order = 0, className = '', as: Tag = 'div' }: { children: ReactNode; order?: number; className?: string; as?: 'div' | 'section' }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(() => reduced || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (seen || reduced) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, reduced]);

  const cls = (reduced ? '' : 'reveal-in' + (seen ? ' is-in' : '')) + (className ? ' ' + className : '');
  return (
    <Tag ref={ref as React.RefObject<HTMLDivElement>} className={cls.trim() || undefined} style={!reduced && order ? { transitionDelay: `${order * 70}ms` } : undefined}>
      {children}
    </Tag>
  );
}
