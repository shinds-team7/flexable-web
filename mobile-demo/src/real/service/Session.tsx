/**
 * 시연판 세션. 실제 앱의 useSession()과 같은 모양을 내보낸다.
 * 시연 온보딩(src/app/onboarding)을 마치면 예시 계정으로 로그인된 상태가 되고,
 * 로그아웃·계정 삭제는 예시 데이터를 지우고 시연을 처음부터 다시 보여 준다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "@/demo/store/AppStore";
import { seedDemoServer } from "@/demo/server";
import { api, setApiSession } from "./api/client";
import type { AuthResponse, User } from "./types";
import { clearInbox } from "./inboxStore";

type Session = {
  user: User | null;
  ready: boolean;
  error: unknown;
  revision: number;
  accept: (auth: AuthResponse) => Promise<void>;
  clear: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retry: () => void;
  invalidate: () => void;
};
const Ctx = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const { onboarded, restartOnboarding } = useStore();
  const [user, setUser] = useState<User | null>(null);
  const [revision, bump] = useState(0);
  const refreshUser = useCallback(async () => {
    setUser(await api<User>("/me"));
  }, []);
  useEffect(() => {
    if (!onboarded) return;
    let alive = true;
    setApiSession("demo");
    api<User>("/me").then((u) => alive && setUser(u));
    return () => {
      alive = false;
    };
  }, [onboarded]);
  const clear = useCallback(async () => {
    setApiSession(null);
    if (user) await clearInbox(user.id).catch(() => {});
    seedDemoServer(null);
    setUser(null);
    bump((x) => x + 1);
    restartOnboarding();
  }, [restartOnboarding, user]);
  return (
    <Ctx.Provider
      value={{
        user: onboarded ? user : null,
        // 온보딩 직후 /me를 받기 전에는 아직 준비 중으로 둔다
        ready: !onboarded || !!user,
        error: undefined,
        revision,
        accept: async (auth) => setUser(auth.user),
        clear,
        refreshUser,
        retry: () => bump((x) => x + 1),
        invalidate: () => bump((x) => x + 1),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
export function useSession() {
  const value = useContext(Ctx);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}
