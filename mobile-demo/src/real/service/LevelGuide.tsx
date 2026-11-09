import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { LEVELS, LevelIcon } from '@/real/components/LevelIcon';
import { T } from '@/real/components/ui';
import { colors, radius } from '@/real/theme';

/** 점수 규칙. 서버 CharacterScore(ATTEND 10·UP 20·DOWN 50)와 docs/policies.md §4를 따른다 */
const RULES: { icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string; title: string; points: string }[] = [
  { icon: 'calendar', tint: colors.brand, bg: colors.brandSoft, title: '출석만 해도', points: '+10점' },
  { icon: 'shield-checkmark', tint: colors.positive, bg: colors.positiveSoft, title: '하루 예산을 지키면', points: '+20점' },
  { icon: 'alert-circle', tint: colors.danger, bg: colors.dangerSoft, title: '하루 예산을 넘기면', points: '−50점' },
];

/** 캐릭터 홈의 '레벨업 조건 및 가이드' 시트 안쪽 */
export function LevelGuide() {
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <T weight="700">점수는 이렇게 달라져요</T>
        {RULES.map((r) => (
          <View key={r.title} style={styles.row}>
            <View style={[styles.badge, { backgroundColor: r.bg }]}>
              <Ionicons name={r.icon} size={20} color={r.tint} />
            </View>
            <T style={{ flex: 1 }}>{r.title}</T>
            <T weight="800" color={r.tint}>
              {r.points}
            </T>
          </View>
        ))}
        <T size={13} color={colors.textMuted}>
          출석한 날 예산도 지키면 하루 최대 +30점이에요. 오늘 결과는 내일 반영돼요
        </T>
      </View>

      <View style={{ gap: 8 }}>
        <T weight="700">단계는 이렇게 올라가요</T>
        {/* 6단계는 한 줄에 안 들어가서 3개씩 두 줄로 보여 준다. 칸에는 아이콘만 두고 이름·점수 구간은 화면 읽기 라벨로만 말한다(11-08) */}
        {[[1, 2, 3], [4, 5, 6]].map((row) => (
          <View key={row[0]} style={styles.levels}>
            {row.map((n, i) => (
              <View key={n} style={styles.levelWrap}>
                {i > 0 && <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
                <View style={styles.level} accessible accessibilityLabel={`${LEVELS[n].name}, ${LEVELS[n].range}`}>
                  <LevelIcon level={n} size={32} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={{ gap: 6 }}>
        <T size={13} color={colors.textSub}>
          · 점수는 0~500점이에요
        </T>
        <T size={13} color={colors.textSub}>
          · 고정지출 자동 기록은 판정에서 제외해요
        </T>
        <T size={13} color={colors.textSub}>
          · 앱을 열지 않은 날은 마지막으로 확인한 하루 예산을 기준으로 해요
        </T>
        <T size={13} color={colors.textSub}>
          · 한 번 달성한 단계의 코스튬은 점수가 내려가도 해금 상태가 유지돼요
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  badge: { width: 36, height: 36, borderRadius: radius.soft, alignItems: 'center', justifyContent: 'center' },
  levels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' },
  level: { alignItems: 'center', gap: 2, flex: 1, backgroundColor: colors.sunken, borderRadius: radius.soft, paddingVertical: 12 },
});
