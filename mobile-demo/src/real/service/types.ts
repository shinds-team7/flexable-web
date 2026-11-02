// 서버 응답 타입. 직접 적지 않고 docs/contracts/app-api.yaml에서 만든 api/schema.d.ts(npm run gen:api)에서 가져온다.
// 응답 모양을 바꾸려면 계약을 먼저 고치고 gen:api를 다시 돌린다(docs/contracts/README.md).
import type { components, paths } from "./api/schema";

type S = components["schemas"];
type Json<R> = R extends { content: { "application/json": infer B } }
  ? B
  : never;

export type Kind = S["TxType"];
export type User = S["User"];
export type LoginProvider = User["provider"];
export type AuthResponse = S["AuthResponse"];
export type Category = S["Category"];
/** category는 서버가 거래의 카테고리를 찾지 못하면 null이다 */
export type Transaction = S["Transaction"];
/**
 * 예산 설정 화면이 들고 있다가 PUT /budget/settings로 보내는 값. GET 응답(Settings)의 항목 id·updatedAt은 쓰지 않는다.
 * seedBase는 이 값이 생기기 전에 기기에 저장한 임시값에는 없다.
 */
export type BudgetSettings = Required<Omit<S["SettingsRequest"], "seedBase">> &
  Pick<S["SettingsRequest"], "seedBase">;
export type SeedChoice = S["SeedChoice"];
export type SeedMoney = S["SeedMoney"];
export type Today = S["Today"];
export type DayPreset = S["DayPreset"];
export type DayWeights = S["DayWeights"];
export type Analysis = S["AnalysisSummary"];
export type ScheduledExpense = S["ScheduledExpense"];
export type ChatRequest = S["ChatRequest"];
export type ChatResponse = S["ChatResponse"];

export type CoinWallet = S["Wallet"];
export type CoinReward = S["Reward"];
export type CheckIn = Json<paths["/coins/check-in"]["post"]["responses"][200]>;
export type CoinLedgerEntry = S["LedgerEntry"];
export type CoinLedgerPage = Json<
  paths["/coins/ledger"]["get"]["responses"][200]
>;
export type Attendance = S["Attendance"];
export type AttendResult = Json<
  paths["/coins/attendance"]["post"]["responses"][200]
>;
export type CollectResult = Json<
  paths["/coins/collect"]["post"]["responses"][200]
>;
export type OutfitList = S["OutfitList"];
export type Outfit = OutfitList["items"][number];
export type Referral = Json<paths["/referrals/me"]["get"]["responses"][200]>;
export type ReferralResult = Json<
  paths["/referrals"]["post"]["responses"][200]
>;
