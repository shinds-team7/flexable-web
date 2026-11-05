import { api } from '@/lib/api';
import type { components } from '@/lib/api-schema';

// 가상 시뮬레이션 대회(/virtual-sim/contests/*, /me/virtual-sim/contests, policies §8-8). 회원만 참가하고 대회 안내만 누구나 본다.
// 금액·수익률·점수·순위는 모두 서버 값을 그대로 보인다. 판 진행은 가상 시뮬레이션 세션(/virtual-sim/state·step·decision·end)을 그대로 쓴다
type S = components['schemas'];
export type ContestBoard = S['VirtualContestBoard'];
export type ContestInfo = S['VirtualContest'];
export type ContestPlacement = S['VirtualContestPlacement'];
export type ContestPlacementResult = S['VirtualContestPlacementResult'];
export type ContestEntry = S['VirtualContestEntry'];
export type ContestRanking = S['VirtualContestRanking'];
export type ContestRankingRow = S['VirtualContestRankingRow'];
export type ContestResult = S['VirtualContestResult'];
export type ContestMine = { alias: string | null; current: ContestEntry | null; history: ContestResult[] };
export type ContestRoundStarted = { sessionToken: string; expiresAt: string; snapshot: S['VirtualContestRoundSnapshot']; round: { roundNumber: number; startBalance: number; roundsLeftToday: number } };
export type Prediction = 'POSITIVE' | 'NEGATIVE' | null;

export const BOARD_LABEL: Record<ContestBoard, string> = { B10M: '1천만 판', B50M: '5천만 판', B100M: '1억 판' };
export const BOARDS: ContestBoard[] = ['B10M', 'B50M', 'B100M'];

export const getContest = () => api<ContestInfo>('/virtual-sim/contests/current');
export const getMyContests = () => api<ContestMine>('/me/virtual-sim/contests');
export const startPlacement = () => api<ContestPlacement>('/virtual-sim/contests/current/placement', { method: 'POST' });
export const submitPlacement = (placementId: string, answers: { questionId: string; prediction: Prediction }[]) =>
  api<ContestPlacementResult>('/virtual-sim/contests/current/placement/answers', { method: 'POST', json: { placementId, answers } });
export const startContestRound = (startId: string) => api<ContestRoundStarted>('/virtual-sim/contests/current/rounds', { method: 'POST', json: { startId } });
export const getRanking = (contestId: string, board: ContestBoard) => api<ContestRanking>(`/virtual-sim/contests/${contestId}/boards/${board}/ranking`);
