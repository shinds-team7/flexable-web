import { api } from '@/lib/api';
import type { components } from '@/lib/api-schema';

export type PracticeSnapshot = components['schemas']['PracticeSnapshot'];
export type Candle = PracticeSnapshot['candles'][number];
export type DecisionResult = PracticeSnapshot['decisions'][number];
export type Category = { code: string; name: string; classificationVersion: string; eligibleCount: number };
export type CategoryResponse = { categories: Category[]; isSample: boolean };
export type Started = { sessionToken: string; expiresAt: string; snapshot: PracticeSnapshot };
export const getCategories = () => api<CategoryResponse>('/practice/categories');
export const practice = <T>(path: string, body: unknown) => api<T>(`/practice/${path}`, { method: 'POST', json: body });
