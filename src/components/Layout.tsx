// 공통 틀: 상단 바(64px, 하위 탭 없음). 본문 최대 1344px(패딩 포함 1280px).
// 로그인한 사용자와 체험 중인 손님은 로고를 누르면 홈(/home)으로 간다.
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LEGAL_BASE, fmtEffective, privacyHref, privacyNotice } from '@/lib/legal';
import { useSession } from '@/auth/session';
import { displayName } from '@/auth/types';
import { useSeedMoney } from '@/data/home';
import { won } from '@/lib/format';
import { Icon, Logo } from './Icons';
import { ScrollTopButton } from './ScrollTopButton';
import { LoginModalProvider, useLoginModal } from './LoginModal';

/** 상단 메뉴. 모든 메뉴는 로그인 없이 체험할 수 있다. match가 있으면 그 경로들에서도 선택 표시를 한다. */
type NavItem = { to: string; label: string; match?: string[]; sub?: { to: string; label: string }[] };
const NAV: NavItem[] = [
  { to: '/guide', label: '금융 가이드' },
  { to: '/type', label: '투자성향' },
  {
    to: '/invest',
    label: '투자',
    match: ['/invest', '/simulation'],
    sub: [
      { to: '/invest', label: '인사이트' },
      { to: '/simulation?mode=past', label: '과거 시장 연습' },
      { to: '/simulation?mode=virtual', label: '가상 시뮬레이션' },
      { to: '/simulation?mode=contest', label: '월간 시뮬레이션 대회' },
    ],
  },
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
  { to: '/goal', label: 'AI 목표달성' },
  { to: '/news', label: '청년소식' },
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

function ProfileMenu() {
  const { status, user, signOut } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // 설정 화면의 로그아웃과 같다: 서버 로그아웃 후 토큰을 지우고 첫 화면으로 간다.
  // disabled 대신 aria-disabled로 막아 처리 중에도 포커스가 버튼에 남고 메뉴가 닫히지 않게 한다.
  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [location]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={box} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button ref={trigger} type="button" className="avatar" aria-label={`${displayName(user)} 프로필 메뉴`}
        aria-expanded={open} aria-controls="profile-links" onClick={() => setOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
        </svg>
      </button>
      {open && <nav className="profile-links" id="profile-links" aria-label="프로필" onClick={() => setOpen(false)}>
        <Link to="/mypage"><Icon id="i-user" size={16} />마이페이지</Link>
        <Link to="/mypage/settings"><Icon id="i-gear" size={16} />설정</Link>
        <Link to="/support"><Icon id="i-help" size={16} />고객지원</Link>
        {status === 'member' && <>
          <hr />
          <button type="button" className="profile-logout" aria-disabled={signingOut || undefined}
            onClick={(event) => {
              event.stopPropagation();
              void logout();
            }}>
            <Icon id="i-logout" size={16} />{signingOut ? '로그아웃 중…' : '로그아웃'}
          </button>
        </>}
      </nav>}
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
  const { status } = useSession();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const [closedSub, setClosedSub] = useState<string | null>(null);
  const member = status === 'member';
  const exploring = status === 'guest' && !['/', '/home', '/login', '/signup', '/oauth/callback'].includes(pathname);
  useEffect(() => setMenu(false), [pathname]);

  return (
    <>
      <header className="topnav">
        <div className="wrap">
          <Link className="logo" to="/home" aria-label="solpa 홈으로">
            <Logo />
            <span className="logo-word">solpa</span>
          </Link>
          <nav className={'mainnav' + (menu ? ' open' : '')} id="mainnav" aria-label="주 메뉴">
            {NAV.map((n) => (
              <div
                key={n.to}
                className={'navitem' + (closedSub === n.to ? ' closed' : '')}
                onMouseLeave={() => setClosedSub((v) => (v === n.to ? null : v))}
                // 키보드만 쓰는 사용자도 포커스가 돌아오면 하위 메뉴를 다시 열 수 있게 한다
                onFocus={() => setClosedSub((v) => (v === n.to ? null : v))}
              >
                {n.match ? (
                  <Link to={n.to} aria-current={n.match.some((m) => pathname === m || pathname.startsWith(m + '/')) ? 'page' : undefined}>
                    {n.label}
                  </Link>
                ) : (
                  <NavLink to={n.to}>{n.label}</NavLink>
                )}
                {n.sub && (
                  <div className="subnav">
                    {n.sub.map((c) => (
                      <Link
                        key={c.to}
                        to={c.to}
                        onClick={(e) => {
                          setClosedSub(n.to);
                          e.currentTarget.blur();
                        }}
                      >
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
            {member && <SeedChip />}
            {(member || exploring) && <ProfileMenu />}
            {status === 'guest' && (
              <button type="button" className="nav-login" onClick={() => openLogin()}>
                로그인
              </button>
            )}
            {status === 'guest' && (
              <Link className="btn btn-primary btn-sm" to="/mypage">
                체험하기
              </Link>
            )}
          </div>
        </div>
      </header>
      {exploring && pathname !== '/support' && (
        <div className="demo-banner" role="status">
          <div className="wrap">
            <span>{['/deposit', '/parking', '/cma'].includes(pathname)
              ? '체험 중이에요. 상품 자료의 출처·기준일과 예시 표시를 확인해 주세요. 체험 내용은 저장되지 않아요.'
              : '체험 중이에요. 예시 데이터로 모든 기능을 써 볼 수 있고, 체험 내용은 저장되지 않아요.'}</span>
            <Link to="/mypage">체험 홈</Link>
            <Link to="/mypage/settings">내 정보</Link>
          </div>
        </div>
      )}
      <main id="main">
        <Outlet />
      </main>
      <ScrollTopButton />
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
      <Link to="/support">고객지원</Link>
      <a href={PLAY_URL} target="_blank" rel="noreferrer">
        앱 받기(Google Play)
      </a>
      <span style={{ marginLeft: 'auto' }}>© solpa</span>
    </footer>
  );
}
