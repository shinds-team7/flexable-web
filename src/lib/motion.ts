// 숫자·카드 움직임 공통 hook. 움직임 줄이기(prefers-reduced-motion)를 켠 사용자에게는 바로 최종값을 보여 준다.
// CSS 애니메이션은 global.css의 reduce 규칙이 끄고, JS로 움직이는 숫자는 여기서 끈다.
// 표시만 움직인다. 최종값은 서버 값 그대로다(ADR-3).
import { useEffect, useRef, useState } from 'react';

const query = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * target까지 숫자를 올린다(처음엔 0부터, 값이 바뀌면 이전 표시값부터). 정수 금액은 decimals 0으로 쓴다.
 * 돌려주는 값은 화면 표시용이다. 스크린 리더에는 최종값을 따로 읽히게 한다.
 */
export function useCountUp(target: number, { duration = 900, decimals = 0 }: { duration?: number; decimals?: number } = {}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
  const from = useRef(shown);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const begin = from.current;
    const k = 10 ** decimals;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = t === 1 ? target : Math.round((begin + (target - begin) * easeOutCubic(t)) * k) / k;
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, decimals]);

  return shown;
}

/** 움직임 줄이기 설정을 따라간다(설정을 바꾸면 다시 그린다). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
