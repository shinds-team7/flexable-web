// Wording for one coin ledger row (GET /coins/ledger). Kept free of imports so test/coin-ledger.test.cjs runs it as is.
// Coins are app-only, so avoid words that read as cash (docs/coin-plan.md §3).
type Entry = {
  reason: string;
  amount: number;
  refDate?: string | null;
};

const LABELS: Record<string, string> = {
  SIGNUP_GIFT: "가입 선물",
  BUDGET_BONUS: "예산 지킴 보너스",
  PASSIVE: "코인 모으기",
  REFERRAL_INVITEE: "추천 코드 등록",
  REFERRAL_INVITER: "친구가 내 추천 코드 등록",
  PURCHASE: "코스튬 구매",
  REFUND: "코스튬 구매 코인 돌려받음",
  ATTENDANCE: "출석체크",
};
/** A milestone day pays this bonus on top of the daily 5, so the entry is above 5 (docs/coin-plan.md §1). */
const DAILY_REWARD = 5;

/** The amount comes first: "+200 가입 선물", "-200 코스튬 구매". */
export function ledgerTitle(e: Entry) {
  const sign = e.amount < 0 ? "-" : "+";
  const label = LABELS[e.reason] ?? "코인";
  return `${sign}${Math.abs(e.amount).toLocaleString("ko-KR")} ${label}`;
}

/** Extra line under the title, or "" when there is nothing to add. */
export function ledgerDetail(e: Entry) {
  if (e.reason === "ATTENDANCE")
    return e.amount > DAILY_REWARD ? "누적 출석 보너스" : "";
  if (e.reason !== "BUDGET_BONUS" || !e.refDate) return "";
  const [, m, d] = e.refDate.split("-").map(Number);
  return `${m}월 ${d}일 예산을 지켰어요`;
}
