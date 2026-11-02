/**
 * 시연판 API 클라이언트. 실제 앱과 같은 api()·ApiError를 내보내지만 네트워크 대신
 * 브라우저 메모리의 목 서버(src/demo/server)를 부른다. 실제 API는 부르지 않는다(AGENTS.md mobile-demo 규칙).
 */
import { handle, MockFailure } from "@/demo/server";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
    public retryAfterSeconds?: number,
    /** SOCIAL_ACCOUNT: 이 이메일 계정에 붙은 로그인 방법(kakao·google) */
    public provider?: string,
  ) {
    super(message);
  }
}
// Bumped on every login/logout so a late response from an earlier session cannot touch the current one.
let generation = 0;
export function setApiSession(_value: string | null, _expired?: () => Promise<void>) {
  generation++;
}
export function sessionGeneration() {
  return generation;
}
export function apiUrl(path: string) {
  return `demo://api/v1${path}`;
}
/** 실제 화면처럼 잠깐 불러오는 시간을 둔다 */
const LATENCY_MS = 140;

export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    token?: string | null;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  if (options.signal?.aborted)
    throw new ApiError("NETWORK", "연결이 불안정해요. 다시 시도해 주세요");
  try {
    const body =
      options.body === undefined
        ? undefined
        : JSON.parse(JSON.stringify(options.body));
    const result = handle(options.method ?? "GET", path, body, options.key);
    return (result === undefined ? undefined : JSON.parse(JSON.stringify(result))) as T;
  } catch (e) {
    if (e instanceof MockFailure)
      throw new ApiError(e.fail.code, e.fail.message, e.fail.fields);
    console.error("[demo api]", path, e);
    throw new ApiError("INTERNAL_ERROR", "잠시 후 다시 시도해 주세요");
  }
}
export function errorText(e: unknown, deletion = false) {
  if (!(e instanceof ApiError)) return "문제가 생겼어요. 다시 시도해 주세요";
  if (e.code === "INVALID_CREDENTIALS")
    return deletion
      ? "비밀번호가 맞지 않아요. 다시 확인해 주세요"
      : "이메일 또는 비밀번호가 맞지 않아요";
  if (e.code === "EMAIL_UNAVAILABLE")
    return "이 이메일로 가입할 수 없어요. 로그인하거나 비밀번호를 찾아보세요";
  if (e.code === "TOO_MANY_ATTEMPTS")
    return `잠시 후 다시 시도해 주세요${e.retryAfterSeconds ? ` (${e.retryAfterSeconds}초 후)` : ""}`;
  if (e.code === "INTERNAL_ERROR")
    return deletion
      ? "삭제하지 못했어요. 잠시 후 다시 시도해 주세요"
      : "불러오지 못했어요. 잠시 후 다시 시도해 주세요";
  return e.message;
}
