// 로그인 상태. 토큰은 localStorage(03-architecture ADR-7: 1단계), 도메인 구매 뒤 httpOnly 쿠키로 바꾼다.
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '@/lib/api';
import { loadSettings } from './settings';
import type { AuthResponse, User } from './types';

type Session = {
  status: 'loading' | 'guest' | 'member';
  user: User | null;
  signIn: (r: AuthResponse) => void;
  signOut: () => Promise<void>;
  /** 서버 호출 없이 이 브라우저의 세션만 지운다(탈퇴 직후 등). */
  clearSession: () => void;
};

const Ctx = createContext<Session | null>(null);

/** 회원별 서버 데이터 캐시. 세션이 끝나면 진행 중 요청과 함께 지워 다음 회원에게 보이지 않게 한다. */
const MEMBER_QUERY_KEYS = [['me'], ['app-link'], ['seed-money']];

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Session['status']>(tokenStore.get() ? 'loading' : 'guest');

  const qc = useQueryClient();

  const clear = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setStatus('guest');
    for (const queryKey of MEMBER_QUERY_KEYS) {
      void qc.cancelQueries({ queryKey });
      qc.removeQueries({ queryKey });
    }
  }, [qc]);

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
        void loadSettings();
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
    void loadSettings();
  }, []);

  // 서버 로그아웃은 이 계정의 모든 기기 웹 토큰을 끊는다(앱 세션은 그대로). 응답과 무관하게 토큰을 지운다.
  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* 무시 */
    }
    clear();
  }, [clear]);

  const value = useMemo(() => ({ status, user, signIn, signOut, clearSession: clear }), [status, user, signIn, signOut, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider 밖에서 useSession을 불렀어요');
  return s;
}
