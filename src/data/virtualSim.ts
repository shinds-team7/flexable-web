import { api } from '@/lib/api';
import type { components } from '@/lib/api-schema';

// 가상 시뮬레이션(/virtual-sim/*, decisions/2026-11-04-virtual-simulation). 토큰·명령 모양은 과거 시장 연습과 같다
export type VirtualSimSnapshot = components['schemas']['VirtualSimSnapshot'];
export type VirtualSimDecision = VirtualSimSnapshot['decisions'][number];
export type VirtualSimStatus = { available: boolean; isSample: boolean };
export type VirtualSimStarted = { sessionToken: string; expiresAt: string; snapshot: VirtualSimSnapshot };
export const getVirtualSimStatus = () => api<VirtualSimStatus>('/virtual-sim/status');
export const virtualSim = <T>(path: string, body: unknown) => api<T>(`/virtual-sim/${path}`, { method: 'POST', json: body });
