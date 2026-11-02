// 숫자·카드 움직임 공통 hook. 움직임 줄이기(prefers-reduced-motion)를 켠 사용자에게는 바로 최종값을 보여 준다.
// CSS 애니메이션은 global.css의 reduce 규칙이 끄고, JS로 움직이는 숫자는 여기서 끈다.
// 표시만 움직인다. 최종값은 서버 값 그대로다(ADR-3).
import { useEffect, useRef, useState, type RefObject } from 'react';

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

/**
 * 마우스 휠 스크롤을 관성 있게 부드럽게 만든다(이 hook을 쓴 화면에서만). CSS scroll-behavior:smooth는 링크·버튼 이동에만 적용되고
 * 휠에는 적용되지 않아서 따로 둔다. 움직임 줄이기 설정, Ctrl+휠(확대), 안쪽에 스크롤 영역이 있는 곳에서는 브라우저 기본 동작을 따른다.
 */
export function useSmoothWheel() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let target = window.scrollY;
    let raf = 0;
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    const scrollsInside = (el: Element | null, dy: number) => {
      for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) {
          if (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
        }
      }
      return false;
    };
    let last = -1; // 이 hook이 마지막으로 옮긴 위치. 다른 코드·링크가 옮겼으면 애니메이션을 멈춘다
    const step = () => {
      const cur = window.scrollY;
      if (last >= 0 && Math.abs(cur - last) > 2) {
        raf = 0;
        last = -1;
        target = cur;
        return;
      }
      const next = cur + (target - cur) * 0.12;
      if (Math.abs(target - next) < 0.5) {
        window.scrollTo({ top: target, behavior: 'instant' });
        raf = 0;
        last = -1;
        return;
      }
      window.scrollTo({ top: next, behavior: 'instant' });
      last = window.scrollY;
      raf = requestAnimationFrame(step);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (document.querySelector('dialog[open]') || scrollsInside(e.target as Element, e.deltaY)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      if (!raf) target = window.scrollY;
      target = Math.max(0, Math.min(max(), target + dy));
      if (!raf) raf = requestAnimationFrame(step);
    };
    // 키보드·스크롤바로 움직이면 목표를 현재 위치로 맞춘다
    const onScroll = () => {
      if (!raf) target = window.scrollY;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
}

/** 화면에 들어온 .reveal 요소에 .in을 붙여 아래에서 위로 나타나게 한다(한 번만). 움직임 줄이기면 바로 보인다. */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current ? [...root.current.querySelectorAll<HTMLElement>('.reveal')] : [];
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [root]);
}
