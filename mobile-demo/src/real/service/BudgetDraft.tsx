import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api/client";
import { useSession } from "./Session";
import { readStorage, writeStorage } from "./storage";
import type { BudgetSettings } from "./types";
const initial = (): BudgetSettings => ({
  balance: 0,
  balanceAt: new Date().toISOString(),
  payday: 25,
  incomeAmount: 0,
  cardUnpaid: 0,
  fixedExpenses: [],
  protectedItems: [],
  seedBase: 0,
});
type Draft = { value: BudgetSettings; step: string; editing: boolean };
const Ctx = createContext<{
  draft: Draft | null;
  error: unknown;
  set: (value: BudgetSettings, step?: string) => void;
  begin: (editing: boolean) => Promise<void>;
  reset: () => Promise<void>;
} | null>(null);
export function BudgetDraftProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const id = user?.id;
  const [loaded, setLoaded] = useState<{ owner: number; draft: Draft } | null>(
    null,
  );
  const [failure, setFailure] = useState<{ owner?: number; error: unknown }>();
  const queue = useRef(Promise.resolve());
  const active = useRef<number | undefined>(id);
  const key = `flexable.service.draft.${id}`;
  const draft = loaded?.owner === id ? (loaded?.draft ?? null) : null;
  useEffect(() => {
    let alive = true;
    active.current = id;
    if (id !== undefined)
      readStorage(key)
        .then((saved) => {
          if (alive) {
            setLoaded({
              owner: id,
              draft: saved
                ? JSON.parse(saved)
                : { value: initial(), step: "index", editing: false },
            });
            setFailure(undefined);
          }
        })
        .catch((error) => {
          if (alive) setFailure({ owner: id, error });
        });
    return () => {
      alive = false;
      active.current = undefined;
    };
  }, [key, id]);
  const persist = (next: Draft) => {
    if (id === undefined) return;
    setLoaded({ owner: id, draft: next });
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (active.current === id)
          await writeStorage(key, JSON.stringify(next));
      })
      .catch((error) => setFailure({ owner: id, error }));
  };
  const set = (value: BudgetSettings, step = draft?.step ?? "index") =>
    persist({ value, step, editing: draft?.editing ?? false });
  const begin = async (editing: boolean) => {
    const value = editing
      ? await api<BudgetSettings>("/budget/settings")
      : (draft?.value ?? initial());
    persist({ value, step: "balance", editing });
  };
  const reset = async () => {
    await queue.current;
    await writeStorage(key, null);
    if (id !== undefined)
      setLoaded({
        owner: id,
        draft: { value: initial(), step: "index", editing: false },
      });
  };
  return (
    <Ctx.Provider
      value={{
        draft,
        error: failure?.owner === id ? failure?.error : undefined,
        set,
        begin,
        reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
export function useBudgetDraft() {
  const value = useContext(Ctx);
  if (!value) throw new Error("BudgetDraftProvider missing");
  return value;
}
