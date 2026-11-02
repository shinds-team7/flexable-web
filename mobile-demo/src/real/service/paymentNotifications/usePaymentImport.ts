import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { api, sessionGeneration } from "../api/client";
import { useSession } from "../Session";
import type { Category, Transaction } from "../types";
import {
  mutatePaymentCollection,
  paymentNative,
  type CollectionStatus,
} from "./native";
import {
  importPaymentNotices,
  type PaymentBody,
  type PaymentProblem,
} from "./process";

type State = {
  owner?: string;
  status?: CollectionStatus;
  problems: PaymentProblem[];
  error?: unknown;
  busy: boolean;
  saved: number;
};
let state: State = { problems: [], busy: false, saved: 0 };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function update(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}
let queue: Promise<unknown> = Promise.resolve();
let refresh: (() => void) | undefined;
let importRevision = 0;
export function interruptPaymentImport() {
  importRevision++;
}
export const refreshPaymentImport = () => refresh?.();
export function usePaymentImportState() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Native collector stays alive without JS. Only the authenticated, active app sends transactions. */
export function useAutomaticPaymentImport() {
  const session = useSession();
  const owner = session.user?.onboarded ? String(session.user.id) : undefined;
  useEffect(() => {
    const native = paymentNative;
    if (!native || !owner) {
      update({
        owner,
        status: undefined,
        problems: [],
        error: undefined,
        busy: false,
        saved: 0,
      });
      return;
    }
    let alive = true;
    let requested = false;
    const generation = sessionGeneration();
    const sessionCurrent = () =>
      alive &&
      generation === sessionGeneration() &&
      AppState.currentState === "active";
    update({
      owner,
      status: undefined,
      problems: [],
      error: undefined,
      busy: false,
      saved: 0,
    });
    const run = async () => {
      if (!sessionCurrent()) return;
      const started = importRevision;
      const current = () => sessionCurrent() && started === importRevision;
      update({ busy: true, error: undefined });
      try {
        const status = await native.status(owner);
        if (!current()) return;
        update({ status });
        if (!status.enabled || !status.allowed) return;
        const notices = await native.pending(owner);
        let categories: Category[] | undefined;
        const result = await importPaymentNotices(notices, {
          current,
          category: async () => {
            categories ??= await api<Category[]>("/categories?type=EXPENSE");
            return (
              categories.find(
                (category) => category.isDefault && category.name === "기타",
              )?.id ?? null
            );
          },
          existing: async (date) =>
            (
              await api<{ items: Transaction[] }>(
                `/transactions?from=${date}&to=${date}`,
              )
            ).items,
          prepare: async (id, body) =>
            JSON.parse(
              await mutatePaymentCollection(
                () => native.prepare(owner, id, JSON.stringify(body)),
                current,
              ),
            ) as PaymentBody,
          save: async (id, body) => {
            await api("/transactions", {
              method: "POST",
              key: `shinhan-${id}`,
              body,
            });
            if (current()) session.invalidate();
          },
          acknowledge: async (id) => {
            await mutatePaymentCollection(
              () => native.acknowledge(owner, id),
              current,
            );
          },
        });
        if (!current()) return;
        const nextStatus = await native.status(owner);
        if (!current()) return;
        update({
          problems: result.problems,
          saved: state.saved + result.saved,
          status: nextStatus,
        });
      } catch (error) {
        if (current()) update({ error });
      } finally {
        if (alive) update({ busy: false });
      }
    };
    const request = () => {
      if (requested || !sessionCurrent()) return;
      requested = true;
      queue = queue
        .catch(() => {})
        .then(async () => {
          requested = false;
          await run();
        });
    };
    refresh = request;
    const app = AppState.addEventListener("change", (value) => {
      if (value === "active") request();
    });
    const receipt = native.addListener("onChange", request);
    const timer = setInterval(request, 30000);
    request();
    return () => {
      alive = false;
      clearInterval(timer);
      app.remove();
      receipt.remove();
      if (refresh === request) refresh = undefined;
    };
    // The session callbacks change on each render. Work belongs to the account and generation captured above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);
}
