// 공통 틀: 상단 바(64px) + 굴려보기 하위 탭(48px). 본문 최대 1344px(패딩 포함 1280px).
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { displayName } from '@/auth/types';
import { useSeedMoney } from '@/data/home';
import { won } from '@/lib/format';
import { Logo } from './Icons';

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
          <p>끝난 정산 주기마다 수입 − 지출(고정지출 포함)을 누적한 값이에요. 직접 입력하면 수정값을 우선 사용해요.</p>
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
  const inLab = pathname.startsWith('/lab');
  useEffect(() => setMenu(false), [pathname]);

  return (
    <>
      <header className="topnav">
        <div className="wrap">
          <Link className="logo" to={member ? '/home' : '/'} aria-label="텅장관리 처음으로">
            <Logo />
            텅장관리
          </Link>
          <nav className={'mainnav' + (menu ? ' open' : '')} id="mainnav" aria-label="주 메뉴">
            {member && <NavLink to="/home">홈</NavLink>}
            <NavLink to="/lab/stocks" className={() => ''} aria-current={inLab ? 'page' : undefined}>
              굴려보기
            </NavLink>
            <NavLink to="/news">청년 돈 소식</NavLink>
            {member && <NavLink to="/goal">목표</NavLink>}
            <NavLink to="/plus">플러스</NavLink>
          </nav>
          <div className="nav-right">
            <button className="menu-btn" aria-expanded={menu} aria-controls="mainnav" onClick={() => setMenu((v) => !v)}>
              메뉴
            </button>
            {member && <SeedChip />}
            {member && (
              <Link className="avatar" to="/me" aria-label="내 정보">
                {displayName(user).slice(0, 1).toUpperCase()}
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
      {inLab && (
        <nav className="subnav" aria-label="굴려보기">
          <div className="wrap">
            <NavLink to="/lab/stocks">주식 타임머신</NavLink>
            <NavLink to="/lab/savings">적금 비교</NavLink>
            <NavLink to="/lab/mix">섞어보기</NavLink>
          </div>
        </nav>
      )}
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}

/** 로그인이 필요한 화면. 확인 중에는 빈 화면, 손님이면 로그인으로 보낸다. */
export function RequireMember() {
  const { status } = useSession();
  const { pathname } = useLocation();
  if (status === 'loading') return <div className="page" aria-busy="true" />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: pathname }} />;
  return <Outlet />;
}

// 약관·개인정보처리방침·고객지원 원문은 앱 저장소(project2)의 웹 페이지 하나만 둔다(Play 등록 주소, 문서와 E2E로 일치 검사).
export const LEGAL_BASE = 'https://project2-flex-sh.vercel.app';
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.flexable.app';

export function Footer() {
  return (
    <footer className="footer">
      <a href={`${LEGAL_BASE}/terms`}>이용약관</a>
      <a href={`${LEGAL_BASE}/privacy`}>개인정보처리방침</a>
      <a href={`${LEGAL_BASE}/support`}>고객지원</a>
      <a href={PLAY_URL} target="_blank" rel="noreferrer">
        앱 받기(Google Play)
      </a>
      <span style={{ marginLeft: 'auto' }}>© 텅장관리</span>
    </footer>
  );
}
