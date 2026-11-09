/**
 * 캐릭터 홈 상단 UI — 예산을 잘 지키고 출석할수록 높은 단계(광부→농부→상인→기사→귀족→왕족, 6단계), 못 지킬수록 광부.
 * 단계·게이지 값은 부르는 쪽(서비스 홈, 서버 점수 pointsStatus)이 계산해서 넘긴다.
 */
import { useEffect, type ReactNode } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

import { colors, motion } from '@/real/theme';
import { useGuideTarget } from './guideTargets';
import { levelName } from './LevelIcon';
import { useAnimValue, useReducedMotion } from './ui';

export type Level = 1 | 2 | 3 | 4 | 5 | 6;

/** 지금 있는 최고 단계. 서버 CharacterScore.MAX(500)와 맞춘다 */
export const TOP_LEVEL: Level = 6;

export type PaceStatus = { level: Level; progress: number; label: string };

/** 서버 캐릭터 점수(0~500, 100점이 한 단계) → 단계와 게이지. 실서비스용 */
export function pointsStatus(points: number, label: string): PaceStatus {
  const p = Math.max(0, points);
  const level = Math.min(TOP_LEVEL, Math.floor(p / 100) + 1) as Level;
  return { level, progress: level === TOP_LEVEL ? 1 : (p % 100) / 100, label };
}

/**
 * 적용 중인 코스튬 영상 하나와 승급 게이지. 캐릭터(character)는 서비스가 전달한다(말풍선은 10-22에 뺐다).
 * 출석 달력 버튼(attendance)은 영상 좌측 상단, 코인 잔액(coin)은 우측 상단에 띄운다. 캐릭터를 누르면 상점, 코인 칩을 누르면 코인 내역(여기에 [모으기])이다.
 * character 는 16:9 칸에 화면 폭을 꽉 채워 그린다(영상 가장자리는 무대 색으로 녹아 있다).
 */
export function CharacterStage({ level, character, coin, attendance, gauge, help, children }: { level: Level; character: ReactNode; coin?: ReactNode; attendance?: ReactNode; gauge: PaceStatus; help?: ReactNode; children: ReactNode }) {
  // 사용 가이드가 가리키는 자리(service/HomeGuide)
  const charRef = useGuideTarget('character');
  const coinRef = useGuideTarget('coin');
  const attendanceRef = useGuideTarget('attendance');
  const gaugeRef = useGuideTarget('gauge');
  const heroRef = useGuideTarget('hero');
  return (
    <View style={[styles.wrap, { backgroundColor: colors.stage }]}>
      <View style={styles.stage}>
        <View ref={charRef} collapsable={false} style={styles.char}>
          {character}
          {coin && (
            <View ref={coinRef} collapsable={false} style={styles.coin}>
              {coin}
            </View>
          )}
          {attendance && (
            <View ref={attendanceRef} collapsable={false} style={styles.attendance}>
              {attendance}
            </View>
          )}
        </View>
      </View>

      {/* 레벨 안내(?)는 게이지 가운데 위 */}
      {help && <View style={styles.help}>{help}</View>}
      <View ref={gaugeRef} collapsable={false} style={{ alignSelf: 'stretch' }}>
        <Gauge status={gauge} />
      </View>

      {/* 오늘 쓸 수 있는 돈 — 캐릭터와 게이지 아래 */}
      <View ref={heroRef} collapsable={false} style={styles.heroSlot}>
        {children}
      </View>
    </View>
  );
}

/**
 * 다음 단계까지 어디쯤인지. 퍼센트 숫자는 보여 주지 않는다(10-22).
 * 모양은 연회색 홈에 블루 알약이 차오르는 형태(11-08 시안 level-gage2). 채움은 단계와 관계없이 블루 하나이고,
 * 채움 끝에 걷는 고양이 그림이 붙어 함께 움직인다. 단계별 레벨 이미지(level-icon-1~6)는 레벨 안내 창에서 쓴다.
 * 게이지 양 끝은 아래 '오늘 쓸 수 있는 돈' 카드 양 끝과 맞춘다.
 * 홈이 처음 그려질 때 0에서 지금 값까지 차오르고, 애니메이션 줄이기가 켜져 있으면 바로 채운다.
 */
function Gauge({ status }: { status: PaceStatus }) {
  const { level, progress, label } = status;
  const top = level === TOP_LEVEL;
  const fill = useAnimValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      fill.setValue(progress);
      return;
    }
    const anim = Animated.timing(fill, { toValue: progress, duration: 700, easing: motion.easeOut, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [progress, reduced, fill]);
  const pct = Math.round(progress * 100);
  const at = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View
      style={styles.gauge}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={top ? `최고 단계, ${label}` : `${levelName(level)} 단계, 승급 게이지 ${pct}%, ${label}`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={styles.track}>
        <Animated.View style={[styles.bar, { width: at }]}>
          <View style={styles.shine} />
        </Animated.View>
      </View>
      {/* 채움 끝을 따라가는 단계 아이콘 */}
      <View style={styles.markRail} pointerEvents="none">
        <Animated.View style={[styles.mark, { left: at }]}>
          <Image source={WALKING_CAT} style={styles.cat} resizeMode="cover" accessible={false} />
        </Animated.View>
      </View>
    </View>
  );
}

/** 채움 끝 고양이 원 지름 */
const MARK = 34;
const WALKING_CAT = require('../../../assets/real/levels/blue-cat-walking-loop.png');
/** 게이지 홈 높이와 안쪽 여백 */
const TRACK = 18;
const INSET = 2;

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
  coin: { position: 'absolute', top: 12, right: 16 },
  attendance: { position: 'absolute', top: 12, left: 16 },
  char: { width: '100%', maxWidth: 640, aspectRatio: 16 / 9 },
  help: { alignSelf: 'center', marginTop: 2, marginBottom: -11 },
  // 홈은 카드 양 끝까지. 끝에 선 고양이 원은 반쯤 바깥(wrap 좌우 여백 16 안)으로 나간다
  gauge: { alignSelf: 'stretch', height: MARK, justifyContent: 'center' },
  // 연회색 홈: 위쪽 안 그림자로 파인 느낌, 아래 흰 선으로 떠오른 가장자리
  track: {
    height: TRACK,
    padding: INSET,
    borderRadius: TRACK / 2,
    backgroundColor: '#E1E5EC',
    boxShadow: 'inset 0 2px 3px rgba(16,26,51,0.14), 0 1px 0 rgba(255,255,255,0.9)',
  },
  bar: {
    height: '100%',
    minWidth: TRACK - INSET * 2,
    borderRadius: TRACK / 2,
    backgroundColor: colors.brand,
    overflow: 'hidden',
    boxShadow: 'inset 0 -2px 0 rgba(0,20,90,0.22), 0 1px 2px rgba(0,52,194,0.3)',
  },
  // 채움 위쪽의 밝은 띠(시안의 광택)
  shine: { position: 'absolute', top: 2, left: 5, right: 5, height: '38%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)' },
  // 홈 안쪽(채움이 움직이는 폭)과 같은 폭의 레일 위에서 아이콘 중심을 채움 끝에 맞춘다
  markRail: { position: 'absolute', left: INSET, right: INSET, top: 0, bottom: 0 },
  mark: {
    position: 'absolute',
    top: 0,
    width: MARK,
    height: MARK,
    marginLeft: -MARK / 2,
    borderRadius: MARK / 2,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(16,26,51,0.2)',
  },
  // 그림 가장자리의 거친 흰 테두리가 원 밖으로 잘리도록 조금 크게
  cat: { width: MARK * 1.1, height: MARK * 1.1 },
});
