// 시연판 저장소: 이 탭의 메모리에만 둔다(새로고침하면 지워진다). 브라우저 저장소·외부로 보내지 않는다.
const memory = new Map<string, string>();
export async function readStorage(key: string) {
  return memory.get(key) ?? null;
}
export async function writeStorage(key: string, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
}
