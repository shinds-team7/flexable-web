import type { components } from '@/lib/api-schema';

// 배치고사 문제·결과 화면의 공시 줄글(Issue #308). 서버가 준 값(공시 주요 내용의 비율·규모 구간·정해 둔 이름, 결과의 회사·날짜·공시 직후와 그다음 주 등락·유형 통계)을
// 문장으로 잇기만 하고 새로 계산하지 않는다(ADR-3). 공시 원문은 서버에 없다(2-6). 서버가 공시 AI 요약(summary, #349)을 주면 주요 내용 줄글 대신 그 글을 쓴다.
// 문제 화면(questionStory)은 회사·날짜·방향·과거 경향을 말하지 않는다(2-2). 그 문장은 "문제 화면에도 쓰는 문구" 구간에 두고
// backend PlacementGuideTextTest가 금지 표현을 검사한다. 회사·날짜·움직임·유형 통계는 결과 화면(disclosureStory)에서만 붙인다.
type Question = components['schemas']['VirtualContestPlacement']['questions'][number];
type Item = components['schemas']['VirtualContestPlacementResult']['items'][number];

/** 마지막 글자에 받침이 있으면 a, 없으면 b. %는 "퍼센트"로 읽어 받침 없음, 한글이 아니면 받침 없음으로 본다 */
function josa(word: string, a: string, b: string) {
  const t = word.replace(/['")\]\s]+$/, '');
  const c = t.charCodeAt(t.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0 ? a : b;
}
const is = (v: string) => `${v}${josa(v, '이에요', '예요')}`;

// 문제 화면에도 쓰는 문구:start
/** 항목 이름 → 문장. 정해 두지 않은 항목은 "이름은 값이에요"로 쓴다 */
const SENTENCE: Record<string, (v: string, q: Question) => string> = {
  '새 주식 수(기존 대비)': (v, q) => q.category === 'BONUS_SHARES'
    ? `기존 주주에게 지금 주식 수의 ${v}만큼 새 주식을 나눠 주기로 했어요. 회사로 들어오는 돈은 없고 주식 수만 늘어요.`
    : `지금 발행된 주식의 ${v}에 해당하는 새 주식을 발행하기로 했어요.`,
  '조달 규모': v => `이번 증자로 모으려는 돈은 ${is(v)}.`,
  '자금 용도': v => `모은 돈은 ${v}의 비중으로 쓰겠다고 밝혔어요.`,
  '증자 방식': v => `새 주식은 '${v}' 방식으로 팔아요.`,
  '사채 종류': v => `${v}를 발행해 돈을 빌리기로 했어요.`,
  '발행 규모': v => `빌리는 돈(권면총액)은 ${is(v)}.`,
  '전환되면 늘어날 주식': v => `사채가 모두 주식으로 바뀌면 발행 주식의 ${v}만큼 주식이 늘어날 수 있어요.`,
  '권리 행사로 늘어날 주식': v => `붙어 있는 권리를 모두 행사하면 발행 주식의 ${v}만큼 새 주식이 생길 수 있어요.`,
  '교환 대상 주식': v => `사채와 바꿔 줄 주식은 발행 주식의 ${is(v)}.`,
  '이자율': v => `이자율은 ${v}로 정했어요.`,
  '취득 예정 규모': v => `사들일 자기주식은 ${v} 규모예요.`,
  '계약 규모': v => `신탁 계약 규모는 ${is(v)}.`,
  '취득 방법': v => `'${v}' 방식으로 사들여요.`,
  '취득 목적': v => `밝힌 목적은 '${v}'${josa(v, '이에요', '예요')}.`,
  '계약 목적': v => `밝힌 목적은 '${v}'${josa(v, '이에요', '예요')}.`,
  '처분 예정 규모': v => `처분할 자기주식은 ${v} 규모예요.`,
  '처분 방법': v => `처분 방법별 몫은 ${is(v)}.`,
  '처분 목적': v => `밝힌 목적은 '${v}'${josa(v, '이에요', '예요')}.`,
  '합병 형태': v => `합병 형태는 '${v}'${josa(v, '이에요', '예요')}.`,
  '상대 회사와의 관계': v => v === '관계 없음' ? '합병 상대는 원래 관계가 없던 회사예요.' : `합병 상대는 이 회사의 ${is(v)}.`,
  '상대 회사 자산 규모': v => `상대 회사의 자산은 ${v} 규모예요.`,
  '분할 방법': v => `'${v}' 방식으로 회사를 나눠요.`,
  '떼어 내는 자산 비중': v => `나눈 뒤 두 회사 자산을 합친 것 가운데 새 회사로 떼어 내는 몫은 ${is(v)}.`,
  '새 회사 자산 규모': v => `새로 생기는 회사의 자산은 ${v} 규모예요.`,
  '자산 종류': v => `사들이는 자산은 ${is(v)}.`,
  '양수 규모': v => `사들이는 금액은 ${v} 규모예요.`,
  '자산총액 대비': v => `회사 자산총액에 견주면 ${v}에 해당해요.`,
  '자기자본 대비': v => `회사 자기자본에 견주면 ${v}에 해당해요.`,
  '양수 뒤 지분율': v => `사들인 뒤 그 회사 지분을 ${v} 갖게 돼요.`,
  '대상 회사와의 관계': v => v === '관계 없음' ? '대상 회사는 원래 관계가 없던 회사예요.' : `대상 회사는 이 회사의 ${is(v)}.`,
  // 공급 계약(원문에서 뽑은 두 칸, #375)
  '매출액 대비': v => `계약 금액은 이 회사 최근 매출액의 ${v}에 해당해요.`,
  '계약 기간': v => `계약 기간은 ${is(v)}.`,
};
const MASKED = '회사를 알아보지 못하게 금액은 규모 구간, 주식 수는 기존 대비 %로만 보여 줘요.';
const NO_DETAILS_QUESTION = '이 공시는 공시 주요 내용을 제공하지 않아요. 공시 제목과 유형 설명을 보고 골라요.';
const AI_NOTE = 'AI가 공시 원문을 읽고 정리한 글이에요. 사람이 검수하지 않았고, 회사를 알아보지 못하게 이름·날짜와 정확한 금액은 빼고 금액은 규모 구간으로만 보여 줘요.';
const SAMPLE_NOTE = '정해 둔 틀로 만든 예시 요약이에요.';
// 문제 화면에도 쓰는 문구:end

/**
 * 공시 AI 요약 → 줄글(요약 + 출처 안내). 요약이 없으면 null.
 * sample: 예시 자료면 true, 실제 자료면 false, 상태를 아직 확인하지 못했으면 null(출처를 단정하지 않고 안내를 붙이지 않는다)
 */
function summaryStory(q: Question, sample: boolean | null): string | null {
  if (!q.summary) return null;
  return sample === null ? q.summary : `${q.summary} ${sample ? SAMPLE_NOTE : AI_NOTE}`;
}

/** 공시 주요 내용 → 줄글. 항목이 없으면 null */
function detailsStory(q: Question): string | null {
  const details = q.details ?? [];
  if (!details.length) return null;
  return details.map(d => (SENTENCE[d.label] ?? (v => `${d.label}${josa(d.label, '은', '는')} ${is(v)}.`))(d.value, q)).join(' ') + ' ' + MASKED;
}

/**
 * 문제 화면의 공시 줄글: 업종·제목과 공시 AI 요약(있으면) 또는 공시 주요 내용만(회사·날짜·방향·과거 경향 없음).
 * 예시 글(body)은 카드에 따로 보이므로 요약·주요 내용이 없으면 안내 문장을 뺀다. sample: 예시 자료면 true, 실제면 false, 아직 모르면 null
 */
export function questionStory(q: Question, title: string, sample: boolean | null = null): string[] {
  const body = summaryStory(q, sample) ?? detailsStory(q) ?? (q.body ? null : NO_DETAILS_QUESTION);
  return [`${q.industry} 회사가 낸 '${title}' 공시예요.`, ...(body ? [body] : [])];
}

// 대회 화면(VirtualContest.tsx)과 같은 표시: 등락은 소수 2자리, 비율은 소수 1자리 내림. 방향은 문장(올랐어요·내렸어요)으로 말한다
const percent = (r: number) => `${Math.abs(r * 100).toFixed(2)}%`;
const share = (r: number) => (Math.floor(r * 1000) / 10).toFixed(1);

/**
 * 결과 문제 하나의 줄글 문단들: ① 누가 언제 무슨 공시를 냈는지 ② 공시 AI 요약 또는 공시 주요 내용(있을 때) ③ 실제 움직임과 같은 유형 통계.
 * 움직임은 반응 창 채점(REACTION)이면 공시 직후(채점)와 그다음 주, 이 규칙 전에 시작한 배치고사(FIVE_DAY)면 5거래일이다(decisions/2026-11-09-placement-reaction-window).
 * 유형 통계는 채점 구간과 같은 구간만 온다(서버): REACTION이면 룰셋 v3의 공시 직후 통계, FIVE_DAY면 5거래일 통계(decisions/2026-11-10-vsim-ruleset-reaction-window).
 * 경향 UP은 시장 조정 측정에서 공시 직후 평균이 오른 쪽이던 반응 창 근거 유형이라, 원 가격 상승 비율이 절반보다 낮을 수 있다.
 * title: 정리한 공시 제목, subsidiary: 종속회사 주요경영사항이면 true, sample: 예시 자료면 true, 실제면 false, 아직 모르면 null
 */
export function disclosureStory(q: Question, it: Item, title: string, subsidiary: boolean, sample: boolean | null = null): string[] {
  const when = it.date ? `${it.date.slice(0, 4)}년 ${Number(it.date.slice(5, 7))}월 ${Number(it.date.slice(8, 10))}일` : null;
  const who = `${q.industry} 회사 ${it.company}`;
  const intro = `${who}${josa(it.company, '이', '가')} ${when ? `${when}에 ` : ''}낸 '${title}' 공시예요.`
    + (subsidiary ? ' 이 회사가 직접 내린 결정이 아니라 종속회사(자회사)가 내린 결정을 알린 공시예요.' : '');
  const body = summaryStory(q, sample)
    ?? detailsStory(q)
    ?? (q.body
      ? q.body
      : '이 공시는 공시 주요 내용(구조화 자료)을 제공하지 않아, 공시 제목과 유형 설명으로만 판단하는 문제였어요. 회사 이름과 날짜로 DART에서 원문을 찾아볼 수 있어요.');
  let after: string;
  if (it.basis === 'REACTION' && it.reactionReturnRate != null && it.nextWeekReturnRate != null) {
    const n = it.nextWeekReturnRate;
    after = `공시 직후 주가는 ${percent(it.reactionReturnRate)} ${it.movement === 'UP' ? '올랐어요' : '내렸어요'}(공시 전날 종가 → 다음 거래일 종가, 채점 기준).`
      + ` 그다음 주에는 ${n === 0 ? '그대로였어요' : `${percent(n)} ${n > 0 ? '올랐어요' : '내렸어요'}`}(다음 거래일 종가 → 5번째 거래일 종가).`;
  } else {
    after = `공시 뒤 5거래일 동안 주가는 ${percent(it.subsequentReturnRate ?? 0)} ${it.movement === 'UP' ? '올랐어요' : '내렸어요'}(기준일 종가 → 5번째 거래일 종가).`;
  }
  if (it.categorySampleCount != null && it.categoryUpShare != null && it.categoryDownShare != null) {
    const reaction = it.basis === 'REACTION';
    after += ` 같은 유형 공시 ${it.categorySampleCount.toLocaleString('ko-KR')}건을 ${reaction ? '공시 직후로' : '5거래일 뒤로'} 보면 ${share(it.categoryUpShare)}%는 올랐고 ${share(it.categoryDownShare)}%는 내렸어요`
      + (!reaction
        ? (it.trend === 'MIXED' ? '. 방향이 자주 갈리는 유형이에요.' : it.trend === 'UP' ? '. 대체로 오른 유형이었지만 이 공시가 꼭 그렇게 움직이지는 않아요.' : it.trend === 'DOWN' ? '. 대체로 내린 유형이었지만 이 공시가 꼭 그렇게 움직이지는 않아요.' : '.')
        : it.trend === 'UP' ? '. 시장 전체 움직임을 빼고 보면 공시 직후 평균이 조금 오른 쪽이던 유형이지만, 평균 차이가 작아 이 공시가 꼭 그렇게 움직이지는 않아요.'
        : it.trend === 'MIXED' ? '. 공시 직후 방향의 근거 유형으로 분류하지 않은 유형이에요.' : '.');
  }
  return [intro, body, after];
}
