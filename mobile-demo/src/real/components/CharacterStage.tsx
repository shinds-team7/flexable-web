/**
 * 캐릭터 홈 상단 UI — 예산을 잘 지킬수록 높은 단계(지금은 Lv.3까지), 못 지킬수록 Lv.1(광부).
 * 단계·게이지 값은 부르는 쪽(서비스 홈, 서버 점수 pointsStatus)이 계산해서 넘긴다.
 */
import { useEffect, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors } from '@/real/theme';
import { T, useAnimValue, useReducedMotion } from './ui';

export type Level = 1 | 2 | 3;

/** 지금 있는 최고 단계. 서버 CharacterScore.MAX(200)와 맞춘다 */
export const TOP_LEVEL: Level = 3;

/** 레벨별 게이지 강조색 */
const ACCENTS: Record<Level, string> = { 1: '#667085', 2: '#8A6A3B', 3: '#1D3A8A' };

export type PaceStatus = { level: Level; progress: number; label: string };

/** 서버 캐릭터 점수(0~200, 100점이 한 단계) → 단계와 게이지. 실서비스용 */
export function pointsStatus(points: number, label: string): PaceStatus {
  const p = Math.max(0, points);
  const level = Math.min(TOP_LEVEL, Math.floor(p / 100) + 1) as Level;
  return { level, progress: level === TOP_LEVEL ? 1 : (p % 100) / 100, label };
}

/**
 * 적용 중인 코스튬 영상 하나와 승급 게이지. 캐릭터(character)는 서비스가 전달한다(말풍선은 10-22에 뺐다).
 * 코인 잔액(coin)은 영상 좌측 상단, 출석 달력 버튼(attendance)은 우측 상단에 띄운다(#197). [모으기]·코스튬은 코인 칩 → 코인 내역의 상점 버튼 → 상점 화면에 있다.
 * character 는 16:9 칸에 화면 폭을 꽉 채워 그린다(영상 가장자리는 무대 색으로 녹아 있다).
 */
export function CharacterStage({ level, character, coin, attendance, gauge, help, children }: { level: Level; character: ReactNode; coin?: ReactNode; attendance?: ReactNode; gauge: PaceStatus; help?: ReactNode; children: ReactNode }) {
  const accent = ACCENTS[level];

  return (
    <View style={[styles.wrap, { backgroundColor: colors.stage }]}>
      <View style={styles.stage}>
        <View style={styles.char}>
          {character}
          {coin && <View style={styles.coin}>{coin}</View>}
          {attendance && <View style={styles.attendance}>{attendance}</View>}
        </View>
      </View>

      <Gauge status={gauge} accent={accent} />
      {help && <View style={{ alignSelf: 'flex-end' }}>{help}</View>}

      {/* 오늘 쓸 수 있는 돈 — 캐릭터와 게이지 아래 */}
      <View style={styles.heroSlot}>{children}</View>
    </View>
  );
}

/** 지금 단계 안에서 하락(왼쪽) ~ 승급(오른쪽) 사이 어디쯤인지. 퍼센트 숫자는 보여 주지 않는다(10-22) */
function Gauge({ status, accent }: { status: PaceStatus; accent: string }) {
  const { level, progress, label } = status;
  const top = level === TOP_LEVEL;
  const fill = useAnimValue(progress);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) fill.setValue(progress);
    else Animated.timing(fill, { toValue: progress, duration: 600, useNativeDriver: false }).start();
  }, [progress, reduced, fill]);
  const pct = Math.round(progress * 100);
  return (
    <View
      style={styles.gauge}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={top ? `최고 단계, ${label}` : `Lv.${level} 승급 게이지 ${pct}%, ${label}`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={styles.gaugeHead}>
        <T size={12} weight="600" color={colors.textMuted}>
          {level === 1 ? 'Lv.1' : `▼ Lv.${level - 1}`}
        </T>
        {top && (
          <T size={13} weight="800" color={accent}>
            최고 단계
          </T>
        )}
        <T size={12} weight="600" color={colors.textMuted}>
          {top ? `Lv.${TOP_LEVEL}` : `Lv.${level + 1} ▲`}
        </T>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: accent, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Screen 의 좌우·상단 여백(16)을 상쇄해 화면 폭을 꽉 채우고, 아래 항목 바로 위에서 끊는다(gap 12 상쇄)
  wrap: {
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: -12,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  heroSlot: { alignSelf: 'stretch', marginTop: 12 },
  // wrap 의 좌우 여백(16)을 상쇄해 화면 끝까지. 넓은 웹 화면에서는 640에서 멈춘다
  stage: { alignItems: 'center', marginHorizontal: -16, alignSelf: 'stretch' },
  coin: { position: 'absolute', top: 12, left: 16 },
  attendance: { position: 'absolute', top: 12, right: 16 },
  char: { width: '100%', maxWidth: 640, aspectRatio: 16 / 9 },
  gauge: { alignSelf: 'stretch', gap: 6, marginTop: 4, paddingHorizontal: 8 },
  gaugeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 5 },
});
