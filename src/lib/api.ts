// API 클라이언트. 웹 백엔드(backend/) 계약은 backend/README.md "API"를 따른다.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api/v1';
const TOKEN_KEY = 'fx.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** code·message 밖의 응답 필드(retryAfterSeconds·fields 등) */
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  /** 서버가 문제 입력을 짚어 줄 때(예: MARKET_UNAVAILABLE이면 시세를 못 받은 종목 코드) */
  get field(): string | undefined {
    return typeof this.details.field === 'string' ? this.details.field : undefined;
  }
}

export const apiUrl = (path: string) => BASE + path;

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* 저장할 수 없는 환경이면 이번 탭에서만 로그인 상태를 유지한다 */
    }
  },
};

let onUnauthorized: (() => void) | null = null;
/** 401을 받으면 세션을 정리하도록 세션 쪽에서 등록한다. */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = tokenStore.get();
  const res = await fetch(apiUrl(path), {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  // 요청 뒤 다른 계정으로 바뀌었으면(늦게 온 이전 회원의 401) 지금 세션은 그대로 둔다
  if (res.status === 401 && token && token === tokenStore.get()) onUnauthorized?.();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const { code, message, ...details } = body && typeof body === 'object' ? body : ({} as Record<string, unknown>);
    throw new ApiError(
      res.status,
      typeof code === 'string' ? code : 'UNKNOWN',
      typeof message === 'string' ? message : '요청을 처리하지 못했어요',
      details,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const errorText = (e: unknown, fallback = '잠시 뒤 다시 시도해 주세요') =>
  e instanceof ApiError ? e.message : e instanceof TypeError ? '서버에 연결하지 못했어요' : fallback;
