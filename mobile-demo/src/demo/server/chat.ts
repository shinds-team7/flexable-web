/**
 * 시연용 AI 메이트 답변. 실제 앱은 서버가 Gemini로 답하지만, 시연은 외부로 보내지 않고
 * 질문 낱말과 예시 데이터(오늘 예산·카테고리별 지출)로 정해 둔 답을 만든다.
 */
type Mate = 'ANALYST' | 'FRIEND' | 'COACH';
type Preset = 'EVEN' | 'RECORD' | 'WEEKEND' | 'WEEKDAY';
type Summary = {
  expenseTotal: number;
  byCategory: { name: string; amount: number; count: number; ratio: number }[];
};
type Context = {
  today: { todayAvailable: number; dailyBudget: number; todaySpent: number; daysLeft: number; remaining: number; weekAvailable: number };
  now: Summary;
  prev: Summary;
  recordReady: boolean;
};

const won = (n: number) => `${Math.abs(n).toLocaleString('ko-KR')}원`;
const LABEL: Record<Preset, string> = {
  EVEN: '기본 배분',
  RECORD: '내 기록 기준',
  WEEKEND: '주말 넉넉히',
  WEEKDAY: '평일 넉넉히',
};
const TONE: Record<Mate, { open: string; close: string }> = {
  ANALYST: { open: '', close: '' },
  FRIEND: { open: '좋은 질문이에요 😊 ', close: '\n천천히 해도 괜찮아요!' },
  COACH: { open: '솔직하게 말할게요. ', close: '\n지금 바로 하나만 실천해 보세요.' },
};

export function chatReply(
  body: { messages?: { role: string; text: string }[]; mate?: Mate },
  c: Context,
): { reply: string; action: { type: 'DAY_PRESET'; preset: Preset; label: string } | null } {
  const mate = body.mate ?? 'ANALYST';
  const q = [...(body.messages ?? [])].reverse().find((m) => m.role === 'USER')?.text ?? '';
  const tone = TONE[mate];
  const say = (text: string, action: Preset | null = null) => ({
    reply: `${tone.open}${text}${tone.close}`,
    action: action ? { type: 'DAY_PRESET' as const, preset: action, label: LABEL[action] } : null,
  });
  const top = c.now.byCategory.filter((x) => x.name !== '고정지출');
  const first = top[0];

  if (/주말/.test(q))
    return say(
      `요일별 배분을 **주말 넉넉히**로 바꿀까요?\n금·토·일에 하루 예산을 더 두고 평일은 조금 줄여요. 확인을 누르면 오늘 하루 예산부터 바뀌어요.`,
      'WEEKEND',
    );
  if (/평일/.test(q))
    return say(
      `요일별 배분을 **평일 넉넉히**로 바꿀까요?\n월~금 점심·교통비에 여유를 두고 주말은 조금 줄여요. 확인을 누르면 오늘 하루 예산부터 바뀌어요.`,
      'WEEKDAY',
    );
  if (/똑같이|매일|균등|기본/.test(q))
    return say(`요일별 배분을 **기본 배분**으로 바꿀까요?\n남은 생활비를 남은 날에 똑같이 나눠요.`, 'EVEN');
  if (/기록|패턴|요일별/.test(q))
    return c.recordReady
      ? say(`최근 기록을 보면 요일마다 쓰는 돈이 달라요. **내 기록 기준**으로 바꾸면 많이 쓰는 요일에 예산을 더 둬요.`, 'RECORD')
      : say(`내 기록 기준을 쓰려면 지출을 기록한 날이 7일 이상, 기록이 있는 요일이 3개 이상이어야 해요.`);
  if (/넘|초과|도움|어떡|망했/.test(q)) {
    const over = c.today.todayAvailable < 0;
    return say(
      over
        ? `오늘 예산을 **${won(c.today.todayAvailable)}** 넘었어요.\n넘은 만큼은 남은 ${c.today.daysLeft}일의 하루 예산에서 조금씩 나눠 빠져요. 내일은 ${first ? `**${first.name}**` : '큰 지출'}부터 줄여 보세요.`
        : `아직 오늘 예산 안이에요. 남은 돈은 **${won(c.today.todayAvailable)}**이에요.`,
    );
  }
  if (/제일|많이|어디|top|탑/i.test(q) && first)
    return say(
      `이번 주기에는 **${first.name}**에 가장 많이 썼어요. ${won(first.amount)}(${first.count}건)으로 지출의 ${Math.round(first.ratio * 100)}%예요.` +
        (top[1] ? `\n다음은 ${top[1].name} ${won(top[1].amount)}, ${top[2] ? `${top[2].name} ${won(top[2].amount)}` : ''} 순이에요.` : ''),
    );
  if (/비교|지난|저번|전달/.test(q)) {
    const diff = c.now.expenseTotal - c.prev.expenseTotal;
    const lines = top.slice(0, 3).map((x) => {
      const before = c.prev.byCategory.find((y) => y.name === x.name)?.amount ?? 0;
      const d = x.amount - before;
      return `· ${x.name} ${won(x.amount)} (${d >= 0 ? '▲' : '▼'} ${won(d)})`;
    });
    return say(
      `직전 같은 기간보다 **${won(diff)} ${diff >= 0 ? '더' : '덜'}** 썼어요.\n${lines.join('\n')}`,
    );
  }
  if (/아끼|절약|줄이|팁/.test(q) && first)
    return say(
      `${first.name} 지출이 가장 커요. 한 번에 ${won(Math.round(first.amount / Math.max(1, first.count) / 100) * 100)}쯤 쓰고 있어서, 주 2번만 줄여도 남은 기간에 ${won(Math.round((first.amount / Math.max(1, first.count)) * 2 * Math.ceil(c.today.daysLeft / 7) / 100) * 100)}쯤 아낄 수 있어요.`,
    );
  if (/오늘|얼마|예산|남았/.test(q))
    return say(
      `오늘 쓸 수 있는 돈은 **${won(c.today.todayAvailable)}**${c.today.todayAvailable < 0 ? ' 넘었어요' : '이에요'}.\n오늘 하루 예산 ${won(c.today.dailyBudget)} 중 ${won(c.today.todaySpent)}를 썼고, 이번 주에는 ${won(c.today.weekAvailable)}을 더 쓸 수 있어요.`,
    );
  return say(
    `시연용 AI 메이트예요. 오늘 예산, 많이 쓴 곳, 지난 기간 비교, 요일별 배분 바꾸기를 물어보세요.\n지금은 오늘 **${won(c.today.todayAvailable)}**, 다음 수입일까지 남은 생활비는 ${won(Math.max(0, c.today.remaining))}이에요.`,
  );
}
