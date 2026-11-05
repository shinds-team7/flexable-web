// 보상형 광고(시연 웹). 실제 광고 SDK는 Android 앱에서만 쓴다. 시연은 광고 화면 대신 잠깐 기다린 뒤 같은 보상(10코인, 하루 3번)을
// 목 서버가 주게 한다(실제 앱은 광고를 끝까지 보면 구글 검증 콜백이 서버에서 지급한다).
import { api } from "./api/client";

export const adsSupported = true;
export type AdResult = "earned" | "closed" | "failed";
export async function showRewardedAd(_userId: number): Promise<AdResult> {
  await new Promise((r) => setTimeout(r, 1500));
  await api("/coins/demo-ad", { method: "POST" });
  return "earned";
}
