// Coin, costume and referral endpoints (docs/API.md "코인·코스튬"). Screens call these instead of api() directly.
import { api } from "./api/client";
import type {
  Attendance,
  AttendResult,
  CheckIn,
  CoinLedgerPage,
  CoinWallet,
  CollectResult,
  OutfitList,
  Referral,
  ReferralResult,
} from "./types";

export const checkIn = () => api<CheckIn>("/coins/check-in", { method: "POST" });
export const ackRewards = (ids: number[]) =>
  api<void>("/coins/rewards/ack", { method: "POST", body: { ids } });
export const getWallet = () => api<CoinWallet>("/coins");
export const collectCoins = () => api<CollectResult>("/coins/collect", { method: "POST" });
export const getAttendance = () => api<Attendance>("/coins/attendance");
/** Pays today's attendance once; calling again returns rewarded 0. */
export const attend = () => api<AttendResult>("/coins/attendance", { method: "POST" });
/** Newest first. Pass the previous page's nextBefore to read older entries. */
export const getLedger = (before?: number) =>
  api<CoinLedgerPage>(before == null ? "/coins/ledger" : `/coins/ledger?before=${before}`);

export const getOutfits = () => api<OutfitList>("/outfits");
export const purchaseOutfit = (id: string) =>
  api<OutfitList>(`/outfits/${encodeURIComponent(id)}/purchase`, { method: "POST" });
/** 시연 전용: 레벨 코스튬을 무료로 연다(목 서버에만 있는 경로) */
export const demoUnlockOutfit = (id: string) =>
  api<OutfitList>(`/outfits/${encodeURIComponent(id)}/demo-unlock`, { method: "POST" });
export const equipOutfit = (outfitId: string | null) =>
  api<OutfitList>("/outfits/equipped", { method: "PUT", body: { outfitId } });

export const getReferral = () => api<Referral>("/referrals/me");
export const registerReferral = (code: string) =>
  api<ReferralResult>("/referrals", { method: "POST", body: { code } });
