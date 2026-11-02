import type { ImportCandidate } from "./parse";
// 고른 이미지에서 읽은 후보를 검토 화면으로 넘긴다. 저장이 끝나면 비운다.
let pending: ImportCandidate[] | null = null;
export const setPending = (items: ImportCandidate[]) => {
  pending = items;
};
export const getPending = () => pending;
export const clearPending = () => {
  pending = null;
};
