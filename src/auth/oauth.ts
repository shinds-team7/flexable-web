// 카카오·Google 로그인: start → (공급자) → /oauth/callback?code= → exchange. 계약은 docs/API.md "소셜 로그인".
import { api, apiUrl } from '@/lib/api';
import type { AuthResponse } from './types';

export type OAuthProvider = 'kakao' | 'google';
const VERIFIER_KEY = 'fx.oauth.verifier';

export const OAUTH_MESSAGES: Record<string, string> = {
  cancelled: '로그인을 취소했어요',
  provider_unavailable: '지금은 이 로그인 방법을 쓸 수 없어요',
  email_in_use: '이미 가입된 이메일이에요. 처음 가입한 방법으로 로그인해 주세요',
  failed: '로그인하지 못했어요. 다시 시도해 주세요',
};

const redirectUri = () => `${window.location.origin}/oauth/callback`;

function base64url(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function fetchProviders(): Promise<OAuthProvider[]> {
  const r = await api<{ providers: OAuthProvider[] }>('/auth/oauth/providers');
  return r.providers;
}

/** 브라우저를 공급자 로그인 화면으로 보낸다. verifier는 탭별(sessionStorage)로 보관한다. */
export async function startOAuth(provider: OAuthProvider) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const q = new URLSearchParams({ redirectUri: redirectUri(), codeChallenge: challenge });
  window.location.assign(apiUrl(`/auth/oauth/${provider}/start?${q}`));
}

export async function exchangeCode(code: string): Promise<AuthResponse> {
  const codeVerifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!codeVerifier) throw new Error(OAUTH_MESSAGES.failed);
  return api<AuthResponse>('/auth/oauth/exchange', { method: 'POST', json: { code, codeVerifier } });
}
