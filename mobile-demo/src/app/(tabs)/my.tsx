/** 5. 마이페이지 — 계좌 연결, 수입·고정지출·보호 금액, AI 메모리, 알림 설정 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useToast } from '@/components/Toast';
import { Button, Card, Chip, ConfirmModal, IconCircle, Screen, SectionTitle, Segment, Sheet, T } from '@/components/ui';
import { ACCOUNTS, USER } from '@/demo/data/mock';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { md } from '@/utils/date';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';
import { DEMO_VERSION } from '@/demo/version';

export default function My() {
  const { income, fixed, protectedList, summary, restartOnboarding, notify, setNotify, homeStyle, setHomeStyle } = useStore();
  const [timeOpen, setTimeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const toast = useToast();
  const [hour, setHour] = useState(notify.hour);
  const [minute, setMinute] = useState(notify.minute);
  const timeLabel = (h: number, m: number) => `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
  const fixedTotal = fixed.reduce((a, f) => a + f.amount, 0);
  const protectedTotal = protectedList.reduce((a, p) => a + p.amount, 0);

  return (
    <Screen>
      {/* 프로필 */}
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <T size={22} weight="800" color="#fff">
            {USER.name.slice(0, 1)}
          </T>
        </View>
        <View style={{ flex: 1 }}>
          <T size={18} weight="800">
            {USER.name}님
          </T>
          <T size={13} color={colors.textMuted}>
            {USER.email}
          </T>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Card>

      {/* 연결 계좌 */}
      <Card>
        <SectionTitle
          title="연결된 계좌·카드"
          right={
            <T size={13} weight="600" color={colors.brandDark}>
              + 추가
            </T>
          }
        />
        <View style={{ gap: 14 }}>
          {ACCOUNTS.map((a) => (
            <View key={a.id} style={styles.row}>
              <IconCircle name={a.type === 'bank' ? 'business' : 'card'} color="#0046FF" size={40} />
              <View style={{ flex: 1 }}>
                <T size={15} weight="600" numberOfLines={1}>
                  {a.bank} {a.name}
                </T>
                <T size={12} color={colors.textMuted}>
                  {a.number}
                </T>
              </View>
              {a.type === 'bank' ? (
                <T size={15} weight="700">
                  {won(summary.bankBalance)}원
                </T>
              ) : (
                <T size={12} weight="600" color={colors.brandDark}>
                  연결됨
                </T>
              )}
            </View>
          ))}
        </View>
        <View style={styles.note}>
          <Ionicons name="shield-checkmark" size={14} color={colors.brandDark} />
          <T size={12} color={colors.textSub} style={{ flex: 1 }}>
            오픈뱅킹 조회 권한만 사용해요 · 결제할 때마다 바로 반영
          </T>
        </View>
      </Card>

      {/* 예산 설정 */}
      <Card>
        <SectionTitle title="예산 설정" />
        <Menu label="월 수입" value={`${won(income.amount)}원`} sub={`매월 ${income.payday}일 · 다음 수입일 ${md(summary.nextPayday)}`} href={{ pathname: demoRoutes.onboardingIncome, params: { edit: '1' } }} />
        <Menu label="고정지출" value={`${won(fixedTotal)}원`} sub={`${fixed.length}건 · 월세, 통신비, 구독 등`} href={{ pathname: demoRoutes.onboardingFixed, params: { edit: '1' } }} />
        <Menu label="보호 금액" value={`${won(protectedTotal)}원`} sub={protectedList.map((p) => p.name).join(', ')} href={{ pathname: demoRoutes.onboardingProtect, params: { edit: '1' } }} />
        <Menu label="계산 근거 보기" sub={`오늘 하루 기준 ${won(summary.dailyLimit)}원`} href={demoRoutes.budgetDetail} />
      </Card>

      {/* 홈 화면 스타일 (기본 ↔ 캐릭터) */}
      <Card>
        <SectionTitle title="홈 화면" />
        <Segment
          items={[
            { key: 'classic', label: '기본 홈' },
            { key: 'character', label: '캐릭터 홈' },
          ]}
          value={homeStyle}
          onChange={(k) => {
            setHomeStyle(k);
            router.navigate(k === 'character' ? demoRoutes.home2 : demoRoutes.home);
          }}
        />
        <T size={12} color={colors.textMuted} style={{ marginTop: 10 }}>
          상단 ‘홈’ 탭을 누르면 선택한 화면으로 열려요
        </T>
      </Card>

      {/* AI */}
      <Card>
        <SectionTitle title="AI" />
        <Menu label="AI 메모리" sub="AI가 기억하는 내 소비 단가·습관 보기/수정" href={demoRoutes.memory} />
        <Menu label="예정 지출 관리" sub="등록한 소비 일정 수정·삭제" href={demoRoutes.schedule} />
      </Card>

      {/* 알림 (모바일 푸시) */}
      <Card>
        <SectionTitle title="푸시 알림" />
        <Toggle label="매일 정산 요약" value={notify.morning} onChange={(v) => setNotify({ ...notify, morning: v })} />
        <Pressable accessibilityRole="button"
          disabled={!notify.morning}
          style={[styles.timeRow, !notify.morning && { opacity: 0.4 }]}
          onPress={() => {
            setHour(notify.hour);
            setMinute(notify.minute);
            setTimeOpen(true);
          }}
        >
          <T size={14} color={colors.textSub} style={{ flex: 1 }}>
            받는 시간
          </T>
          <T size={15} weight="700" color={colors.brandDark}>
            {timeLabel(notify.hour, notify.minute)}
          </T>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        <Toggle label="결제할 때마다 남은 금액 알림" value={notify.payment} onChange={(v) => setNotify({ ...notify, payment: v })} />
        <Toggle label="고액 지출 D-7 알림" value={notify.plan} onChange={(v) => setNotify({ ...notify, plan: v })} />
        <Toggle label="주간 소비 리포트" value={notify.weekly} onChange={(v) => setNotify({ ...notify, weekly: v })} />
      </Card>

      <Card style={{ gap: 4, paddingVertical: 8 }}>
        <Pressable accessibilityRole="button" style={styles.menu} onPress={() => setResetOpen(true)}>
          <T size={15}>처음 설정 다시 하기 (온보딩)</T>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.menu} onPress={() => router.push(demoRoutes.simulations)}>
          <T size={15}>시연 메뉴 (결제·푸시 시뮬레이션)</T>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        {['공지사항', '고객센터', '로그아웃'].map((l) => (
          <Pressable
            key={l}
            accessibilityRole="button"
            style={styles.menu}
            onPress={() => toast(l === '로그아웃' ? '시연 버전에서는 로그아웃할 수 없어요' : `${l}은 정식 버전에서 열려요`)}
          >
            <T size={15} color={l === '로그아웃' ? colors.textMuted : colors.text}>
              {l}
            </T>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ))}
      </Card>
      <T size={12} color={colors.textMuted} style={{ textAlign: 'center' }}>
        Flex-able 텅장관리 시연용 v{DEMO_VERSION}
      </T>

      <Sheet visible={timeOpen} onClose={() => setTimeOpen(false)} title="정산 요약 받을 시간" subtitle="새벽 정산이 끝난 뒤, 이 시간에 오늘 쓸 수 있는 돈을 푸시로 보내드려요">
        <T size={13} weight="600" color={colors.textSub} style={{ marginBottom: 8 }}>
          시
        </T>
        <View style={styles.grid}>
          {[6, 7, 8, 9, 10, 11, 12, 13, 18, 19, 20, 21].map((h) => (
            <Chip key={h} label={timeLabel(h, 0).replace(':00', '시')} on={hour === h} onPress={() => setHour(h)} />
          ))}
        </View>
        <T size={13} weight="600" color={colors.textSub} style={{ marginTop: 16, marginBottom: 8 }}>
          분
        </T>
        <View style={styles.grid}>
          {[0, 10, 20, 30, 40, 50].map((m) => (
            <Chip key={m} label={`${String(m).padStart(2, '0')}분`} on={minute === m} onPress={() => setMinute(m)} />
          ))}
        </View>
        <Button
          label={`${timeLabel(hour, minute)}로 저장`}
          style={{ marginTop: 22 }}
          onPress={() => {
            setNotify({ ...notify, hour, minute });
            setTimeOpen(false);
          }}
        />
      </Sheet>
      <ConfirmModal
        visible={resetOpen}
        title="처음 설정을 다시 할까요?"
        message="계좌 연결부터 수입·고정지출·보호 금액을 다시 입력해요. 지금 입력된 값은 새로 입력한 값으로 바뀌어요."
        confirmLabel="다시 설정"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          setResetOpen(false);
          restartOnboarding();
          router.replace(demoRoutes.onboarding);
        }}
      />
    </Screen>
  );
}

function Menu({ label, value, sub, href }: { label: string; value?: string; sub?: string; href: Href }) {
  return (
    <Pressable accessibilityRole="button" style={[styles.row, { paddingVertical: 10 }]} onPress={() => router.push(href)}>
      <View style={{ flex: 1 }}>
        <T size={15} weight="600">
          {label}
        </T>
        {sub && (
          <T size={12} color={colors.textMuted} numberOfLines={1}>
            {sub}
          </T>
        )}
      </View>
      {value && (
        <T size={15} weight="700">
          {value}
        </T>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.row, { paddingVertical: 8 }]}>
      <T size={15} style={{ flex: 1 }}>
        {label}
      </T>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brand, false: '#D0D5DD' }}
        thumbColor="#fff"
        {...({ activeThumbColor: '#fff' } as object)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 16, backgroundColor: colors.brandSofter, borderRadius: 12, padding: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingLeft: 12, marginBottom: 4, borderLeftWidth: 2, borderLeftColor: colors.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  menu: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
});
