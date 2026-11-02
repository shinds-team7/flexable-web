// 시연판: expo-crypto 대신 브라우저 crypto로 중복 방지 키를 만든다.
export function randomUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
