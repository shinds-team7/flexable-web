// 소개 페이지 부품: 이미지 자리(파일이 없으면 "예시 이미지"), 화면 틀(브라우저·휴대폰), 아키텍처 도식.
import { useState, type ReactNode } from 'react';

/** 이미지를 그리고, 파일이 아직 없으면(불러오기 실패) 같은 비율의 "예시 이미지" 자리를 그린다.
 *  public/ 아래 같은 경로에 파일을 넣으면 코드 수정 없이 바뀐다. */
export function Img({ src, alt, ratio, label }: { src: string; alt: string; ratio: string; label?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="info-ph" style={{ aspectRatio: ratio }} role="img" aria-label={`${alt} (예시 이미지 자리)`}>
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="6" y="10" width="36" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="17" cy="20" r="3.5" fill="currentColor" />
          <path d="M8 34l10-9 7 6 6-5 9 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <b>{label ?? alt}</b>
        <span className="tag-ex">예시 이미지</span>
        <code>{src}</code>
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" style={{ aspectRatio: ratio }} onError={() => setFailed(true)} />;
}

export function BrowserShot({ src, alt, url }: { src: string; alt: string; url?: string }) {
  return (
    <div className="info-browser">
      <div className="info-browser-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        {url && <span>{url}</span>}
      </div>
      <Img src={src} alt={alt} ratio="1440 / 794" />
    </div>
  );
}

export function PhoneShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="info-phone">
      <Img src={src} alt={alt} ratio="780 / 1600" />
      <span className="info-phone-island" aria-hidden="true" />
    </div>
  );
}

/* ── 아키텍처 도식: 위에서 아래로 층(tier)을 쌓고, 층 사이에 연결선(link)을 둔다 ── */

export function Tier({ label, children, tone }: { label: string; children: ReactNode; tone?: 'brand' | 'subtle' | 'ext' }) {
  return (
    <div className={`arch-tier ${tone ?? ''} reveal`}>
      <span className="arch-tier-label">{label}</span>
      <div className="arch-tier-body">{children}</div>
    </div>
  );
}

export function Node({ title, sub, items, grow }: { title: string; sub?: string; items?: string[]; grow?: boolean }) {
  return (
    <div className={`arch-node${grow ? ' grow' : ''}`}>
      <b>{title}</b>
      {sub && <small>{sub}</small>}
      {items && (
        <ul>
          {items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Link({ label, both }: { label: string; both?: boolean }) {
  return (
    <div className="arch-link reveal" aria-hidden="true">
      <svg viewBox="0 0 24 56">
        {both && <path d="M6 12l6-8 6 8" />}
        <path d="M12 4v48" />
        <path d="M6 44l6 8 6-8" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

/* ── 아이콘 타일(고민·해결 카드). 블루 그라데이션 유리 타일 위 흰 선 아이콘 ── */
const ICONS: Record<string, ReactNode> = {
  wallet: (
    <>
      <rect x="8" y="14" width="32" height="22" rx="5" />
      <path d="M8 19h28a4 4 0 0 1 4 4" />
      <circle cx="32" cy="26" r="2.4" fill="currentColor" />
      <path d="M13 14l16-6 3 6" />
    </>
  ),
  book: (
    <>
      <path d="M24 13c-4-3-10-4-15-3v24c5-1 11 0 15 3 4-3 10-4 15-3V10c-5-1-11 0-15 3z" />
      <path d="M24 13v24" />
    </>
  ),
  chart: (
    <>
      <path d="M10 38h28" />
      <rect x="12" y="26" width="6" height="12" rx="1.5" />
      <rect x="21" y="20" width="6" height="18" rx="1.5" />
      <rect x="30" y="14" width="6" height="24" rx="1.5" />
      <path d="M11 20l10-8 6 4 11-8m0 0h-6m6 0v6" />
    </>
  ),
  calendar: (
    <>
      <rect x="9" y="12" width="30" height="26" rx="5" />
      <path d="M9 20h30M17 8v8M31 8v8M16 27h4M24 27h4M16 32h4" />
    </>
  ),
  coin: (
    <>
      <circle cx="24" cy="24" r="14" />
      <path d="M17 18l3.5 12L24 20l3.5 10L31 18M16 24h16" />
    </>
  ),
  bell: (
    <>
      <path d="M14 32V22a10 10 0 0 1 20 0v10l3 3H11z" />
      <path d="M21 38a3 3 0 0 0 6 0" />
    </>
  ),
  target: (
    <>
      <circle cx="24" cy="24" r="14" />
      <circle cx="24" cy="24" r="8" />
      <circle cx="24" cy="24" r="2.5" fill="currentColor" />
    </>
  ),
  news: (
    <>
      <rect x="9" y="10" width="30" height="28" rx="5" />
      <path d="M15 18h18M15 24h18M15 30h10" />
    </>
  ),
  link: (
    <>
      <path d="M21 27a6 6 0 0 0 8.5 0l6-6a6 6 0 0 0-8.5-8.5l-2 2" />
      <path d="M27 21a6 6 0 0 0-8.5 0l-6 6a6 6 0 0 0 8.5 8.5l2-2" />
    </>
  ),
  shield: (
    <>
      <path d="M24 8l13 5v10c0 9-6 15-13 17-7-2-13-8-13-17V13z" />
      <path d="M18 24l4 4 8-8" />
    </>
  ),
};

export function IconTile({ name }: { name: string }) {
  return (
    <span className="info-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48">{ICONS[name]}</svg>
    </span>
  );
}

/* ── 숫자 카드의 작은 그림 ── */
export function Ring({ pct }: { pct: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg className="info-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="track" />
      <circle cx="50" cy="50" r={r} className="bar" style={{ strokeDasharray: `${(c * pct) / 100} ${c}` }} />
    </svg>
  );
}

export function Bars({ from, to, fromLabel, toLabel, max }: { from: number; to: number; fromLabel: string; toLabel: string; max: number }) {
  return (
    <div className="info-bars" aria-hidden="true">
      <div>
        <span className="v">{from}</span>
        <i style={{ height: `${(from / max) * 100}%` }} />
        <span className="l">{fromLabel}</span>
      </div>
      <div className="now">
        <span className="v">{to}</span>
        <i style={{ height: `${(to / max) * 100}%` }} />
        <span className="l">{toLabel}</span>
      </div>
    </div>
  );
}
