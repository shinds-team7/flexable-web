// 앱 연동(웹 백엔드 GET·POST·DELETE /api/v1/app-link, backend/README.md "API"). 금액은 앱 서버가 확정한 값을 그대로 보여 준다.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AppProvider = 'email' | 'kakao' | 'google';
export type SeedChoice = 'GOAL' | 'ALL' | 'MANUAL';

export type AppSeedMoney = {
  /** ok: 금액 있음, budget_not_set: 앱에서 예산 설정 전, unknown: 아직 한 번도 받지 못함 */
  state: 'ok' | 'budget_not_set' | 'unknown';
  total: number | null; // 모아둔 돈 + 반영한 돈
  base: number | null; // 모아둔 돈
  monthlyGoal: number | null; // 매달 저축할 돈
  lastEntry: { cycleEnd: string; choice: SeedChoice; amount: number; createdAt: string } | null;
  updatedAt: string | null;
};

export type AppLink = {
  linked: boolean;
  /** 미연동일 때만. app_unlinked = 앱에서 해제했거나 앱을 탈퇴해 이번 조회에서 연동이 끝남 */
  reason: 'app_unlinked' | null;
  linkedAt: string | null;
  account: { email: string | null; provider: AppProvider } | null;
  seedMoney: AppSeedMoney | null;
  /** stale = 앱 서버 조회 실패라 syncedAt 기준 값 */
  sync: { state: 'ok' | 'stale'; syncedAt: string } | null;
};

const KEY = ['app-link'];

export const useAppLink = (enabled: boolean) =>
  useQuery({ queryKey: KEY, queryFn: () => api<AppLink>('/app-link'), enabled, retry: false });

export function useLinkApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<AppLink>('/app-link', { method: 'POST', json: { code } }),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

export function useUnlinkApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/app-link', { method: 'DELETE' }),
    onSuccess: () => qc.setQueryData<AppLink>(KEY, { linked: false, reason: null, linkedAt: null, account: null, seedMoney: null, sync: null }),
  });
}
