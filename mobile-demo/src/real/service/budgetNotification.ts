// 시연판: 앱의 budgetNotification.web.ts와 같다(브라우저에는 기기 알림이 없다).
// 웹에는 기기 알림이 없다.
export async function clearBudgetNotification() {}
export function useBudgetNotification() {}
type Status = "off" | "checking" | "shown" | "permission" | "unavailable" | "error";
export function useBudgetNotificationStatus(): Status { return "unavailable"; }
export async function requestBudgetNotificationPermission() { return false; }
