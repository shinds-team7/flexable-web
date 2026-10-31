// 공통 틀: 상단 바(64px, 하위 탭 없음). 본문 최대 1344px(패딩 포함 1280px).
// 로그인한 사용자와 체험 중인 손님은 로고를 누르면 홈(/home)으로 간다.
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LEGAL_BASE, fmtEffective, privacyHref, privacyNotice } from '@/lib/legal';
import { useSession } from '@/auth/session';
import { displayName } from '@/auth/types';
import { useSeedMoney } from '@/data/home';
import { won } from '@/lib/format';
import { Logo } from './Icons';
import { LoginModalProvider, useLoginModal } from './LoginModal';

/** 상단 메뉴. 모든 메뉴는 로그인 없이 체험할 수 있다. */
type NavItem = { to: string; label: string; sub?: { to: string; label: string }[] };
const NAV: NavItem[] = [
  { to: '/type', label: '투자성향' },
  {
    to: '/invest',
    label: '인사이트',
    sub: [
      { to: '/invest?board=KOSPI', label: '코스피' },
      { to: '/invest?board=KOSDAQ', label: '코스닥' },
      { to: '/invest?board=ETF', label: 'ETF' },
    ],
  },
  { to: '/simulation', label: '시뮬레이션' },
  {
    to: '/savings',
    label: '예적금',
    sub: [
      { to: '/deposit', label: '예금' },
      { to: '/savings', label: '적금' },
      { to: '/parking', label: '파킹' },
      { to: '/cma', label: 'CMA' },
    ],
  },
  { to: '/goal', label: 'AI 계획' },
  { to: '/news', label: '청년소식' },
  { to: '/plus', label: '플러스' },
];

function SeedChip() {
  const { data } = useSeedMoney();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  if (!data) return null;
  const amount = data.manual ?? data.confirmed;
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button className="seed-chip" aria-expanded={open} aria-controls="seedPop" onClick={() => setOpen((v) => !v)}>
        <span className="lbl">내 시드머니</span>
        <b className="num">{won(amount)}원</b>
        {data.isSample && <span className="tag-ex">예시</span>}
      </button>
      {open && (
        <div className="popover" id="seedPop" role="dialog" aria-label="시드머니란">
          <h3>내 시드머니 {won(amount)}원</h3>
          <p>앱에서 모아둔 돈과 수입일 전날마다 반영한 돈을 더한 값이에요. 홈에서 직접 고친 금액이 있으면 그 값을 써요.</p>
          <p>앱에 입력한 기록 기준이라 실제 통장 잔액과 다를 수 있어요.</p>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  return (
    <LoginModalProvider>
      <LayoutBody />
    </LoginModalProvider>
  );
}

function LayoutBody() {
  const { openLogin } = useLoginModal();
  const { status, user } = useSession();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const member = status === 'member';
  const exploring = status === 'guest' && !['/', '/login', '/signup', '/oauth/callback'].includes(pathname);
  useEffect(() => setMenu(false), [pathname]);

  return (
    <>
      <header className="topnav">
        <div className="wrap">
          <Link className="logo" to={member || exploring ? '/home' : '/'} aria-label="solpa 홈으로">
            <Logo />
            <span className="logo-word">solpa</span>
          </Link>
          <nav className={'mainnav' + (menu ? ' open' : '')} id="mainnav" aria-label="주 메뉴">
            {NAV.map((n) => (
              <div key={n.to} className="navitem">
                <NavLink to={n.to}>{n.label}</NavLink>
                {n.sub && (
                  <div className="subnav">
                    {n.sub.map((c) => (
                      <Link key={c.to} to={c.to}>
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="nav-right">
            <button className="menu-btn" aria-expanded={menu} aria-controls="mainnav" onClick={() => setMenu((v) => !v)}>
              메뉴
            </button>
            {(member || exploring) && <SeedChip />}
            {(member || exploring) && (
              <Link className="avatar" to="/me" aria-label="내 정보">
                {member ? displayName(user).slice(0, 1).toUpperCase() : '체험'}
              </Link>
            )}
            {status === 'guest' && (
              <button type="button" className="nav-login" onClick={() => openLogin()}>
                로그인
              </button>
            )}
            {status === 'guest' && !exploring && (
              <Link className="btn btn-primary btn-sm" to="/home">
                체험하기
              </Link>
            )}
          </div>
        </div>
      </header>
      {exploring && (
        <div className="demo-banner" role="status">
          <div className="wrap">
            <span>체험 중이에요. 예시 데이터로 모든 기능을 써 볼 수 있고, 체험 내용은 저장되지 않아요.</span>
            <Link to="/home">체험 홈</Link>
            <Link to="/me">내 정보</Link>
          </div>
        </div>
      )}
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}

// 약관·개인정보처리방침 주소는 lib/legal. 기존 import 경로(@/components/Layout)를 위해 다시 내보낸다.
export { LEGAL_BASE };
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.flexable.app';

export function Footer() {
  return (
    <footer className="footer">
      <a href={`${LEGAL_BASE}/terms`}>이용약관</a>
      <a href={privacyHref}>개인정보처리방침</a>
      {privacyNotice && <Link to="/privacy">웹 개인정보처리방침 시행 안내({fmtEffective()})</Link>}
      <a href={`${LEGAL_BASE}/support`}>고객지원</a>
      <a href={PLAY_URL} target="_blank" rel="noreferrer">
        앱 받기(Google Play)
      </a>
      <span style={{ marginLeft: 'auto' }}>© solpa</span>
    </footer>
  );
}
