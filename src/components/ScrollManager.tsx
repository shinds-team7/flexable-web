import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// 데이터가 늦게 와서 페이지가 짧으면 되돌릴 위치까지 내려갈 수 없으니, 이 시간 안에 길어지면 다시 맞춘다
const RESTORE_WAIT_MS = 1500;
const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/**
 * 화면 이동 때 스크롤 위치를 맞춘다.
 * - 메뉴·링크로 새 화면에 들어가면 맨 위부터 보인다(#위치 링크와 쿼리만 바뀌는 탭 전환은 제외).
 * - 뒤로·앞으로 가기는 그 화면에서 보던 위치로 돌아간다. 위치는 탭 메모리에만 두고 브라우저 저장소에 쓰지 않는다.
 * - 새로고침은 브라우저 기본 동작(보던 위치 유지)에 맡긴다.
 * html의 smooth 스크롤 때문에 움직임이 보이지 않게 항상 바로(instant) 이동한다.
 */
export function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const positions = useRef<Record<string, number>>({});
  const currentKey = useRef(location.key);
  const prevPath = useRef<string | null>(null);

  // 보던 위치를 화면(history 항목)별로 기억한다
  useEffect(() => {
    const onScroll = () => {
      positions.current[currentKey.current] = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    currentKey.current = location.key;
    const firstRender = prevPath.current === null;
    const samePage = prevPath.current === location.pathname;
    prevPath.current = location.pathname;
    // 첫 화면(처음 열기·새로고침)은 브라우저가 맞춘다
    if (firstRender) return;
    const go = (top: number) => window.scrollTo({ top, left: 0, behavior: 'instant' });

    if (navType === 'POP') {
      const target = positions.current[location.key];
      // 새로고침 전에 보던 항목처럼 기억이 없으면 브라우저 복원에 맡긴다
      if (target == null) return;
      go(target);
      if (Math.abs(window.scrollY - target) < 2) return;
      // 아직 페이지가 짧아 끝까지 못 내려갔으면, 내용이 길어질 때 다시 맞춘다. 사용자가 먼저 움직이면 멈춘다.
      let done = false;
      const observer = new ResizeObserver(() => {
        if (done) return;
        go(target);
        if (Math.abs(window.scrollY - target) < 2) stop();
      });
      const timer = setTimeout(() => stop(), RESTORE_WAIT_MS);
      function stop() {
        done = true;
        observer.disconnect();
        clearTimeout(timer);
        USER_INPUT.forEach((e) => window.removeEventListener(e, stop));
      }
      observer.observe(document.body);
      USER_INPUT.forEach((e) => window.addEventListener(e, stop, { passive: true }));
      return stop;
    }

    // 새로 들어온 화면: #위치는 그 자리로, 쿼리만 바뀐 같은 화면은 위치 유지, 나머지는 맨 위
    if (location.hash) {
      try {
        document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
      } catch {
        /* 잘못된 #값이면 움직이지 않는다 */
      }
      return;
    }
    if (!samePage) go(0);
  }, [location.key, location.pathname, location.hash, navType]);

  return null;
}
