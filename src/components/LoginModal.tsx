// 헤더 우측 [로그인]이 여는 로그인 모달. 로그인 버튼은 모두 이 모달을 연다(비로그인은 기본이 체험).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { LoginPanel } from '@/pages/Login';

type Ctx = { openLogin: (from?: string) => void };
const LoginModalContext = createContext<Ctx>({ openLogin: () => {} });
export const useLoginModal = () => useContext(LoginModalContext);

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const ref = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState('/home');
  const [open, setOpen] = useState(false);

  const openLogin = useCallback(
    (to?: string) => {
      // 랜딩에서 열면 체험 홈으로, 그 밖에서는 보던 화면으로 돌아온다
      setFrom(to ?? (pathname === '/' ? '/home' : pathname + search));
      setOpen(true);
    },
    [pathname, search],
  );

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <LoginModalContext.Provider value={{ openLogin }}>
      {children}
      {open && (
        <dialog
          ref={ref}
          className="login-modal"
          aria-label="로그인"
          onClose={() => setOpen(false)}
          onClick={(e) => e.target === ref.current && setOpen(false)}
        >
          <button type="button" className="login-modal-x" aria-label="닫기" onClick={() => setOpen(false)}>
            ✕
          </button>
          <LoginPanel from={from} onSignedIn={() => setOpen(false)} />
        </dialog>
      )}
    </LoginModalContext.Provider>
  );
}
