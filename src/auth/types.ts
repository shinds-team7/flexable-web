// docs/API.md 인증 절과 같은 모양
export type User = {
  id: number;
  email: string | null;
  onboarded: boolean;
  createdAt: string;
  provider: 'email' | 'kakao' | 'google';
  hasPassword: boolean;
};

export type AuthResponse = { accessToken: string; expiresAt: string; user: User };

/** 화면에 보이는 프로필 이름. 서버에 별명이 없어 이메일 앞부분을 쓴다. */
export const displayName = (u: User | null) => u?.email?.split('@')[0] || '나';
