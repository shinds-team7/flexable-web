// 모든 페이지 공통 [맨 위로]: 조금 내려가면 오른쪽 아래에 밝은 회색 원이 나타난다. Layout에서 한 번만 붙인다.
// 부드럽게 올라간다(움직임 줄이기 설정이면 바로 이동).
import { useEffect, useState } from 'react';

export function ScrollTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  const up = () =>
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  return (
    <button type="button" className="to-top" onClick={up} aria-label="맨 위로 올라가기">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <path d="M7 4l6 6-6 6" />
      </svg>
    </button>
  );
}
