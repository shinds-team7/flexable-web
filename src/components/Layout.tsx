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

/** 상단 메뉴. 모든 메뉴는 로그인 없이 체험할 수 있다. */
const NAV = [
  { to: '/type', label: '내 투자 성향' },
  { to: '/invest', label: '투자 시뮬레이션' },
  { to: '/savings', label: '적금 모아보기' },
  { to: '/goal', label: 'AI 계획 수립' },
  { to: '/news', label: '청년 금융 소식' },
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
          <Link className="logo" to={member || exploring ? '/home' : '/'} aria-label="텅장관리 홈으로">
            <Logo />
          </Link>
          <nav className={'mainnav' + (menu ? ' open' : '')} id="mainnav" aria-label="주 메뉴">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}>
                {n.label}
              </NavLink>
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
              <Link className="btn btn-primary btn-sm" to="/login">
                로그인
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
      <span style={{ marginLeft: 'auto' }}>© 텅장관리</span>
    </footer>
  );
}
