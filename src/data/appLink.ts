// 앱 연동(웹 백엔드 GET·POST·DELETE /api/v1/app-link, backend/README.md "API"). 금액은 앱 서버가 확정한 값을 그대로 보여 준다.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AppProvider = 'email' | 'kakao' | 'google';
export type SeedChoice = 'GOAL' | 'ALL' | 'MANUAL';

/** available: 금액 있음, budget_not_set: 앱에서 예산 설정 전, not_received: 아직 한 번도 받지 못함. 금액은 available일 때만 있다. */
export type AppSeedMoney =
  | {
      status: 'available';
      total: number; // 모아둔 돈 + 반영한 돈
      base: number; // 모아둔 돈
      monthlyGoal: number; // 매달 저축할 돈
      lastEntry: { cycleEnd: string; choice: SeedChoice; amount: number; createdAt: string } | null;
      updatedAt: string;
      /** 앱 첫 하루 예산 기록일. 없으면 null */
      startedOn: string | null;
      /** 주기별 반영 기록(주기 종료일 오름차순). totalAfter는 앱이 계산한 반영 후 합계 */
      entries: SeedEntry[];
    }
  | {
      status: 'budget_not_set' | 'not_received';
      total: null;
      base: null;
      monthlyGoal: null;
      lastEntry: null;
      updatedAt: null;
      startedOn: null;
      entries: null;
    };

export type SeedEntry = { cycleEnd: string; choice: SeedChoice; amount: number; totalAfter: number; createdAt: string | null };

export type AppLink =
  | {
      /** 웹 서버에 앱 서버 주소·서비스 키가 설정됐는지. false면 [앱 연동하기]를 보여 주지 않는다 */
      enabled: boolean;
      linked: false;
      /** app_unlinked = 앱에서 해제했거나 앱을 탈퇴해 이번 조회에서 연동이 끝남 */
      reason: 'app_unlinked' | null;
      linkedAt: null;
      account: null;
      seedMoney: null;
      sync: null;
    }
  | {
      enabled: boolean;
      linked: true;
      reason: null;
      linkedAt: string;
      account: { email: string | null; provider: AppProvider };
      seedMoney: AppSeedMoney;
      /** fresh = 방금 앱 서버에서 받음, stale = 앱 서버 조회 실패라 syncedAt 기준 값 */
      sync: { status: 'fresh' | 'stale'; syncedAt: string };
    };

const KEY = ['app-link'];

export const useAppLink = (enabled: boolean) =>
  useQuery({ queryKey: KEY, queryFn: () => api<AppLink>('/app-link'), enabled, retry: false });

export function useLinkApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<AppLink>('/app-link', { method: 'POST', json: { code } }),
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
      void qc.invalidateQueries({ queryKey: ['seed-money'] });
    },
  });
}

export function useUnlinkApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/app-link', { method: 'DELETE' }),
    onSuccess: () => {
      qc.setQueryData<AppLink>(KEY, (prev) => ({
        enabled: prev?.enabled ?? true,
        linked: false,
        reason: null,
        linkedAt: null,
        account: null,
        seedMoney: null,
        sync: null,
      }));
      void qc.invalidateQueries({ queryKey: ['seed-money'] });
    },
  });
}
