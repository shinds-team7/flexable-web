// 로그인 상태. 토큰은 localStorage(03-architecture ADR-7: 1단계), 도메인 구매 뒤 httpOnly 쿠키로 바꾼다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '@/lib/api';
import type { AuthResponse, User } from './types';

type Session = {
  status: 'loading' | 'guest' | 'member';
  user: User | null;
  signIn: (r: AuthResponse) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Session['status']>(tokenStore.get() ? 'loading' : 'guest');

  const clear = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setStatus('guest');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    let alive = true;
    api<User>('/me')
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setStatus('member');
      })
      .catch(() => alive && clear());
    return () => {
      alive = false;
    };
  }, [clear]);

  const signIn = useCallback((r: AuthResponse) => {
    tokenStore.set(r.accessToken);
    setUser(r.user);
    setStatus('member');
  }, []);

  // 서버 로그아웃은 이 사용자의 모든 기기 토큰을 끊는다(앱 포함). 응답과 무관하게 토큰을 지운다.
  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* 무시 */
    }
    clear();
  }, [clear]);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider 밖에서 useSession을 불렀어요');
  return s;
}
