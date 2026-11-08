// 오류 기록(POST /client-errors)에 무엇을 보낼지 정하는 규칙. 외부 모듈을 쓰지 않는 순수 함수만 둔다.
// 결정: docs/decisions/2026-11-08-error-events.md

/** 사용자가 고칠 수 있거나 화면이 이미 안내하는, 예상된 서버 응답. 기록하지 않는다. */
export const EXPECTED_CODES = new Set([
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'SOCIAL_ACCOUNT',
  'OAUTH_CODE_INVALID',
  'EMAIL_UNAVAILABLE',
  'TOO_MANY_ATTEMPTS',
  'LINK_CODE_INVALID',
  'APP_LINK_EXISTS',
  'APP_LINK_IN_PROGRESS',
  'GOAL_CHANGED',
  'GOAL_SCENARIO_LIMIT',
  'GOAL_SCENARIO_EXPIRED',
  'CONTEST_CLOSED',
  'CONTEST_NOT_JOINED',
  'CONTEST_ALREADY_JOINED',
  'CONTEST_LIQUIDATED',
  'CONTEST_DAILY_LIMIT',
  'PRACTICE_CONFLICT',
  'PRACTICE_EXPIRED',
  'PRACTICE_CAPACITY',
]);

/** 한 번 페이지를 연 동안 보내는 최대 건수(같은 오류는 한 번만) */
export const SESSION_LIMIT = 20;

/** API 실패를 기록할지. 연결 끊김(응답 없음)은 흔하고 고칠 게 없어 보내지 않는다. */
export function shouldReportApi(status: number, code: string | undefined): boolean {
  if (status < 400) return false;
  if (status === 401) return false;
  return !code || !EXPECTED_CODES.has(code);
}

/** 같은 페이지 안에서 같은 오류인지 */
export function reportKey(r: {
  kind: string;
  status?: number;
  code?: string;
  method?: string;
  path?: string;
  message: string;
}): string {
  return [r.kind, r.status, r.code, r.method, r.path?.split('?')[0], r.message].map((v) => v ?? '').join('|');
}

/** 경로에서 쿼리를 뺀다(날짜·검색어가 들어갈 수 있다). 숫자 id는 서버가 묶는다. */
export function cleanPath(path: string): string {
  return path.split('?')[0].slice(0, 300);
}

export function cut(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length <= max ? text : text.slice(0, max);
}
