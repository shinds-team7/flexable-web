/**
 * 사용 가이드(코치 마크)가 가리킬 화면 요소. 요소는 useGuideTarget(id)의 ref를 달고,
 * 가이드는 measureGuideTarget(id)로 화면 안 위치를 재서 그 자리만 밝게 비춘다(service/HomeGuide).
 * 화면에 없는 요소(다른 탭, 꺼진 기능)는 등록되지 않아 그 단계를 건너뛴다.
 */
import { useEffect, useRef } from "react";
import type { View } from "react-native";

export type GuideRect = { x: number; y: number; width: number; height: number };

const targets = new Map<string, View>();

/** ref를 붙인 View(Pressable 포함)를 id로 등록한다. Android에서 사라지지 않게 그 View에 collapsable={false}를 준다 */
export function useGuideTarget(id: string) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const view = ref.current;
    if (!view) return;
    targets.set(id, view);
    return () => {
      if (targets.get(id) === view) targets.delete(id);
    };
  });
  return ref;
}

export function hasGuideTarget(id: string) {
  return targets.has(id);
}

/** 창 기준 위치. 없거나 크기가 0이면 null */
export function measureGuideTarget(id: string): Promise<GuideRect | null> {
  const view = targets.get(id);
  if (!view?.measureInWindow) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      view.measureInWindow((x, y, width, height) =>
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null),
      );
    } catch {
      resolve(null);
    }
  });
}
