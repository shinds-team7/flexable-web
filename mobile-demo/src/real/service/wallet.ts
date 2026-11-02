import { useSyncExternalStore } from "react";
import { sessionGeneration } from "./api/client";
import type { CoinWallet } from "./types";
// The last wallet the server returned, shared by the home, the header shop button and the shop,
// so collecting in the shop clears the header dot without another request.
// Kept with the session that fetched it, so the next account never sees the previous one's costume.
let current: { generation: number; wallet: CoinWallet } | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const read = () =>
  current?.generation === sessionGeneration() ? current.wallet : null;
/** generation is sessionGeneration() from before the request; a late answer from an earlier session is dropped. */
export function publishWallet(wallet: CoinWallet, generation: number) {
  if (generation !== sessionGeneration()) return;
  current = { generation, wallet };
  listeners.forEach((l) => l());
}
export function useWallet() {
  return useSyncExternalStore(subscribe, read, read);
}
