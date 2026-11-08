// 브라우저가 겪은 오류를 서버 오류 기록(POST /client-errors)에 보낸다. 결과를 기다리지 않고, 실패해도 화면 동작에 영향을 주지 않는다.
// 보내는 것: 오류 종류·메시지·스택(코드 위치), 화면 경로(쿼리 제외), API 경로(쿼리 제외)·상태·코드, 웹 빌드 버전.
// 보내지 않는 것: 요청·응답 본문, 입력값, 쿼리 문자열. 숫자·이메일은 서버가 저장 전에 한 번 더 가린다.
// 웹 백엔드(VITE_API_URL 없음)를 쓸 때만 보낸다. 앱 서버를 쓰는 배포에는 같은 경로가 있어도 보내지 않는다.
import { apiUrl, setApiErrorListener, tokenStore } from '@/lib/api';
import { usesWebBackend } from '@/lib/legal';
import { cleanPath, cut, reportKey, SESSION_LIMIT, shouldReportApi } from '@/lib/errorReportRules';

type Kind = 'API' | 'CRASH' | 'JS';
type Report = {
  kind: Kind;
  message: string;
  stack?: string;
  method?: string;
  path?: string;
  status?: number;
  code?: string;
};

const VERSION = cut(import.meta.env.VITE_APP_VERSION as string | undefined, 20);
let sent = 0;
const seen = new Set<string>();

function post(body: object, withToken: boolean) {
  const token = withToken ? tokenStore.get() : null;
  return fetch(apiUrl('/client-errors'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

export function reportError(r: Report) {
  if (!usesWebBackend) return;
  const message = cut(r.message?.trim() || '(메시지 없음)', 2000)!;
  const key = reportKey({ ...r, message });
  if (seen.has(key) || sent >= SESSION_LIMIT) return;
  seen.add(key);
  sent++;
  const body = {
    kind: r.kind,
    message,
    stack: cut(r.stack, 8000),
    screen: cut(window.location.pathname, 100),
    method: r.method,
    path: r.path ? cleanPath(r.path) : undefined,
    status: r.status,
    code: cut(r.code, 40),
    appVersion: VERSION,
  };
  void (async () => {
    try {
      const res = await post(body, true);
      // 토큰이 만료됐으면 회원 번호 없이 한 번 더 보낸다
      if (res.status === 401) await post(body, false);
    } catch {
      /* 오류 기록이 실패해도 아무것도 하지 않는다 */
    }
  })();
}

/** 화면이 죽었을 때(오류 경계) */
export function reportCrash(error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error));
  reportError({ kind: 'CRASH', message: `${err.name}: ${err.message}`, stack: err.stack });
}

let installed = false;

/** 앱 시작 때 한 번. API 실패와 처리하지 못한 브라우저 오류를 기록한다. */
export function installErrorReporting() {
  if (installed) return;
  installed = true;
  setApiErrorListener((e) => {
    if (e.path.startsWith('/client-errors')) return;
    if (!shouldReportApi(e.status, e.code)) return;
    reportError({ kind: 'API', message: e.message, method: e.method, path: `/api/v1${e.path}`, status: e.status, code: e.code });
  });
  window.addEventListener('error', (ev) => {
    const err = ev.error instanceof Error ? ev.error : undefined;
    reportError({
      kind: 'JS',
      message: err ? `${err.name}: ${err.message}` : ev.message || '(알 수 없는 오류)',
      stack: err?.stack,
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason as unknown;
    // API 실패는 위 리스너가 이미 기록한다
    if (typeof reason === 'object' && reason !== null && 'status' in reason && 'code' in reason) return;
    const err = reason instanceof Error ? reason : undefined;
    reportError({
      kind: 'JS',
      message: err ? `${err.name}: ${err.message}` : `처리하지 못한 거부: ${String(reason)}`,
      stack: err?.stack,
    });
  });
}
