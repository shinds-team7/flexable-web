import { seoulDate, useResource } from "./ui";
import type { paths } from "./api/schema";

type ScheduledExpensesResponse =
  paths["/scheduled-expenses"]["get"]["responses"][200]["content"]["application/json"];

/** 서버 배포 전에도 기존 앱 흐름이 유지되도록 같은 릴리스의 읽기 API로 준비 여부만 확인한다. */
export function useServerExtensions() {
  const date = seoulDate();
  const result = useResource<ScheduledExpensesResponse>(
    `/scheduled-expenses?from=${date}&to=${date}`,
  );
  return {
    available: !!result.data && !result.error,
    checking: result.loading,
  };
}
