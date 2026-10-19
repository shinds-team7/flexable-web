/**
 * [시연] 푸시 알림 결과 화면 (잠금화면)
 *   /m/push?type=morning  아침 정산 요약 (마이에서 설정한 시간)
 *   /m/push?type=settle   지난 일정 정산 요청
 *   /m/push?type=plan     고액 지출 D-7
 */
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';

import { LockScreen } from '@/demo/components/LockScreen';
import { useStore } from '@/demo/store/AppStore';
import { diffDays, endOfWeek, fromKey, toKey } from '@/utils/date';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function DemoPush() {
  const { type = 'morning' } = useLocalSearchParams<{ type?: string }>();
  const { summary: s, scheduled, plans, today, notify } = useStore();
  const [real] = useState(() => new Date());

  let now = real;
  let title = '';
  let body = '';
  let href: Href = demoRoutes.home;

  if (type === 'settle') {
    const x = scheduled.find((v) => v.status === 'planned' && v.date < toKey(today));
    title = x ? `어제 ‘${x.title}’ 얼마 썼나요?` : '정산할 일정이 없어요';
    body = x ? `예상 ${won(x.amount)}원 · 실제 결제와 연결하면 남은 돈을 생활비로 돌려드려요` : '모든 일정을 정산했어요';
    href = x ? demoRoutes.settle(x.id) : demoRoutes.schedule;
  } else if (type === 'plan') {
    const p = plans.find((v) => endOfWeek(fromKey(v.weekStart)) >= today);
    title = p ? `${p.title} 결제 주가 다가와요` : '예정된 고액 지출이 없어요';
    body = p ? `D-${diffDays(fromKey(p.weekStart), today)} · ${won(p.amount)}원 준비 중이에요` : '지출계획에서 큰 지출을 등록해 보세요';
    href = demoRoutes.plan;
  } else {
    now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), notify.hour, notify.minute);
    title = `오늘은 ${won(s.dailyLimit)}원까지 쓸 수 있어요`;
    body = `어제 정산을 마쳤어요. 다음 수입일까지 ${s.daysLeft}일${s.todayPlanned.length ? ` · 오늘 예정 소비 ${won(s.todayPlanned.reduce((a, x) => a + x.amount, 0))}원은 따로 빼뒀어요` : ''}`;
    href = demoRoutes.home;
  }

  return <LockScreen now={now} title={title} body={body} onOpen={() => router.replace(href)} />;
}
