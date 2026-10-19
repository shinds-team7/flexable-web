// 와이어프레임의 SVG 아이콘 모음. <Icon id="i-lock" />처럼 쓴다. 카카오 말풍선은 자리 표시용이며 공식 리소스로 바꾼다.
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="i-lock" viewBox="0 0 16 16">
        <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" />
      </symbol>
      <symbol id="i-check" viewBox="0 0 16 16">
        <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>
      <symbol id="i-info" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 7v4.5M8 4.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </symbol>
      <symbol id="i-clock" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.6V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </symbol>
      <symbol id="i-mark" viewBox="0 0 16 16">
        <path d="M4 2.5h8v11l-4-2.6-4 2.6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </symbol>
      <symbol id="i-mark-on" viewBox="0 0 16 16">
        <path d="M4 2.5h8v11l-4-2.6-4 2.6z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </symbol>
      <symbol id="i-kakao" viewBox="0 0 18 18">
        <path d="M9 2C4.6 2 1 4.8 1 8.2c0 2.2 1.5 4.1 3.7 5.2l-.9 3.3c-.1.3.3.5.5.3l3.9-2.6c.3 0 .5.1.8.1 4.4 0 8-2.8 8-6.2S13.4 2 9 2z" fill="#000" />
      </symbol>
      <symbol id="i-cat" viewBox="0 0 72 72">
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M17 31 19 13l11 9q6-2 12 0l11-9 2 18q3 21-19 22-22-1-19-22z" />
          <path d="M27 36q3-3 6 0M39 36q3-3 6 0" />
          <path d="M33 43q3 3 6 0" />
          <path d="M50 47l9 9M13 60h46" />
        </g>
        <g fill="currentColor" opacity=".35">
          <ellipse cx="10" cy="58" rx="7" ry="2.6" />
          <ellipse cx="10" cy="54" rx="7" ry="2.6" />
          <ellipse cx="62" cy="58" rx="7" ry="2.6" />
        </g>
      </symbol>
    </svg>
  );
}

export const Icon = ({ id, size = 12 }: { id: string; size?: number }) => (
  <svg width={size} height={size} aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

export const Logo = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="8" style={{ fill: 'var(--brand)' }} />
    <rect x="5" y="7" width="13" height="11" rx="3" fill="#fff" opacity=".9" />
    <rect x="9" y="10" width="14" height="12" rx="3.5" stroke="#fff" strokeWidth="2" style={{ fill: 'var(--brand)' }} />
    <rect x="18" y="14.5" width="5" height="2.6" rx="1.3" fill="#fff" />
  </svg>
);

export function DDay({ d }: { d: number | null }) {
  if (d == null) return <span className="dday calm">상시</span>;
  if (d === 0)
    return (
      <span className="dday">
        <Icon id="i-clock" />
        오늘 마감
      </span>
    );
  if (d <= 7)
    return (
      <span className="dday">
        <Icon id="i-clock" />
        D-{d}
      </span>
    );
  return <span className="dday calm">D-{d}</span>;
}
