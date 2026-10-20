// 웹 설정(GET·PATCH /me/settings). 저장에 실패해도 화면은 브라우저 값으로 계속 쓴다.
import { api } from '@/lib/api';
import { applyTheme, type Theme } from '@/lib/theme';

export type Settings = { theme: Theme; seenTours: string[]; disclaimerAckAt: string | null };
export type SettingsPatch = Partial<{ theme: Theme; seenTours: string[]; disclaimerAck: true }>;

/** 로그인 뒤 계정에 저장된 테마를 적용한다. 서버가 설정을 주지 못하면 브라우저 값을 그대로 둔다. */
export async function loadSettings(): Promise<Settings | null> {
  try {
    const s = await api<Settings>('/me/settings');
    applyTheme(s.theme === 'dark' ? 'dark' : 'light');
    return s;
  } catch {
    return null;
  }
}

export async function saveSettings(patch: SettingsPatch): Promise<Settings | null> {
  try {
    return await api<Settings>('/me/settings', { method: 'PATCH', json: patch });
  } catch {
    return null;
  }
}
