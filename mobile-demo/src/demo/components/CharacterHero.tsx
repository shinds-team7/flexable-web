/**
 * 시연 캐릭터 홈 상단 — 이번 주기 소비 속도(쓴 돈 ÷ 같은 기간 예산)로 단계를 정한다.
 * 좌우 < > 버튼으로 시연용 레벨을 바꿀 수 있다. 화면 UI는 공통 CharacterStage를 쓴다.
 */
import { useState } from 'react';

import { CharacterStage, coinStage, type Level, type PaceStatus } from '@/components/CharacterStage';
import { TodayHeroCard } from '@/demo/components/HomeContent';
import type { BudgetSummary } from '@/demo/store/budget';
import { useStore } from '@/demo/store/AppStore';
import { diffDays } from '@/utils/date';

/** 단계별 소비 속도 구간 [승급 쪽 경계, 하락 쪽 경계]. 속도 = 쓴 돈 ÷ 같은 기간 예산(1이면 예산만큼) */
const BANDS: Record<Level, [number, number]> = {
  5: [0, 0.8],
  4: [0.8, 0.95],
  3: [0.95, 1.05],
  2: [1.05, 1.2],
  1: [1.2, 1.5],
};

/** 소비 속도 → 단계와 게이지(0 = 곧 하락, 1 = 곧 승급). short 면 생활비가 모자란 상태라 Lv.1 */
export function paceStatus(pace: number, short: boolean): PaceStatus {
  if (short) return { level: 1, progress: 0, label: '남은 생활비가 모자라요' };
  const level: Level = pace <= 0.8 ? 5 : pace <= 0.95 ? 4 : pace <= 1.05 ? 3 : pace <= 1.2 ? 2 : 1;
  const [lo, hi] = BANDS[level];
  const progress = level === 5 ? 1 : Math.min(1, Math.max(0, (hi - pace) / (hi - lo)));
  const diff = Math.round((1 - pace) * 100);
  const label = diff > 0 ? `이번 주기 예산보다 ${diff}% 덜 쓰는 중` : diff < 0 ? `이번 주기 예산보다 ${-diff}% 더 쓰는 중` : '이번 주기 예산만큼 쓰는 중';
  return { level, progress, label };
}

/** 이번 주기 소비 속도로 단계 계산: 지금까지 쓴 돈 ÷ (같은 기간 예산) */
export function statusFromBudget(s: BudgetSummary, today: Date): PaceStatus {
  const total = diffDays(s.cycleEnd, s.cycleStart) + 1;
  const elapsed = diffDays(today, s.cycleStart) + 1;
  const expected = (s.cycleBudget * elapsed) / total;
  const pace = expected > 0 ? s.cycleSpent / expected : 1;
  return paceStatus(pace, s.shortage > 0);
}

export function CharacterHero() {
  const { summary: s, today } = useStore();
  const status = statusFromBudget(s, today);
  const auto = status.level;
  const [level, setLevel] = useState<Level>(auto);
  // 예산 상태가 바뀌면 시연용으로 바꾼 레벨을 자동 레벨로 되돌린다
  const [prevAuto, setPrevAuto] = useState(auto);
  if (auto !== prevAuto) {
    setPrevAuto(auto);
    setLevel(auto);
  }
  return (
    <CharacterStage level={level} coins={coinStage(s.todayAvailable, s.dailyLimit)} onChange={setLevel} gauge={level === auto ? status : { level, progress: 0.5, label: '시연용으로 단계를 바꿨어요' }}>
      <TodayHeroCard />
    </CharacterStage>
  );
}

