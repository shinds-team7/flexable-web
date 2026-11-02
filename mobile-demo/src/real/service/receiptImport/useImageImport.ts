/**
 * 시연판 이미지 가져오기. 실제 앱은 고른 스크린샷을 기기 안(ML Kit)에서 읽지만, 시연 웹은 사진을 고르지 않고
 * '토스 거래내역 예시 스크린샷'을 읽은 결과를 그대로 검토 화면(/transactions/import)에 넘긴다.
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { REVIEW_TYPE, type ImportCandidate } from "./parse";
import { setPending } from "./store";
import { addDays, kstDate } from "@/demo/server/calc";
export const imageImportSupported = true;

function sample(): ImportCandidate[] {
  const today = kstDate();
  const base = { balance: null, ownTransfer: false, refund: false, review: [] as string[] };
  return [
    { ...base, date: today, title: "GS25 역삼점", amount: 4800, type: "EXPENSE" },
    { ...base, date: addDays(today, -1), title: "스타벅스 강남R점", amount: 6300, type: "EXPENSE" },
    { ...base, date: addDays(today, -1), title: "쿠팡", amount: 23900, type: "EXPENSE" },
    { ...base, date: addDays(today, -2), title: "이준호", amount: 12000, type: null, review: [REVIEW_TYPE] },
    { ...base, date: addDays(today, -2), title: "내 토스뱅크 통장", amount: 100000, type: "EXPENSE", ownTransfer: true },
  ];
}

export function useImageImport() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useFocusEffect(
    useCallback(() => {
      lock.current = false;
      setBusy(false);
    }, []),
  );
  const start = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    // 읽는 시간처럼 잠깐 기다린다
    await new Promise((resolve) => setTimeout(resolve, 700));
    setPending(sample());
    router.push("/transactions/import");
  };
  return {
    start,
    busy,
    error: undefined as string | undefined,
    diagnostic: undefined as { summary: string; detail: string } | undefined,
    clearError: () => {},
  };
}
