/**
 * 자연어 예정 지출 파서 (Mock).
 * "다음주 금요일 아카데미 회식" → { date, items: [{label, amount, basis}] }
 * 시연 전용. 실제 서비스에는 AI 기능이 없다(docs/FEATURES.md).
 */
import { addDays, startOfWeek } from '@/utils/date';
import type { MemoryItem } from './memory';

export type DraftItem = { label: string; amount: number; basis: string; memoryId?: string };
export type PlanDraft = {
  title: string;
  date: Date;
  dateGuessed: boolean; // 날짜를 못 찾아서 기본값(오늘)을 넣었는지
  items: DraftItem[];
  total: number;
  /** 고액 지출로 보이는 경우 → 지출계획(추천) 화면으로 안내 */
  large?: { amount: number; title: string };
};

const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
const LARGE_WORDS = ['노트북', '맥북', '모니터', '아이패드', '아이폰', '갤럭시', '에어팟', '여행', '항공권', '가전', '냉장고', '세탁기', '자전거'];

export function parseAmount(text: string): number | null {
  const man = text.match(/(\d+(?:\.\d+)?)\s*만\s*(\d{1,4})?\s*천?\s*원?/);
  if (man) {
    const base = parseFloat(man[1]) * 10000;
    const rest = man[2] ? parseInt(man[2], 10) * (/천/.test(man[0]) ? 1000 : 1) : 0;
    return Math.round(base + rest);
  }
  const chun = text.match(/(\d+)\s*천\s*원/);
  if (chun) return parseInt(chun[1], 10) * 1000;
  const won = text.match(/(\d{1,3}(?:,\d{3})+|\d{3,})\s*원/);
  if (won) return parseInt(won[1].replace(/,/g, ''), 10);
  return null;
}

export function parseDate(text: string, today: Date): Date | null {
  if (/모레/.test(text)) return addDays(today, 2);
  if (/내일/.test(text)) return addDays(today, 1);
  if (/오늘|이따|저녁에/.test(text) && !/요일/.test(text)) return today;

  const md = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (md) {
    let d = new Date(today.getFullYear(), parseInt(md[1], 10) - 1, parseInt(md[2], 10));
    if (d < today) d = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
    return d;
  }
  const dOnly = text.match(/(?:^|\s)(\d{1,2})\s*일/);
  if (dOnly) {
    const day = parseInt(dOnly[1], 10);
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
    return d;
  }

  const dow = text.match(/(다다음\s*주|다음\s*주|담주|이번\s*주)?\s*([월화수목금토일])요일/);
  if (dow) {
    const target = DOWS.indexOf(dow[2]);
    const weekOffset = !dow[1] ? 0 : /다다음/.test(dow[1]) ? 2 : /다음|담/.test(dow[1]) ? 1 : 0;
    const monday = addDays(startOfWeek(today), weekOffset * 7);
    let d = addDays(monday, (target + 6) % 7);
    if (!dow[1] && d < today) d = addDays(d, 7); // "금요일" 이 이미 지났으면 다음 주
    return d;
  }
  if (/주말/.test(text)) {
    const sat = addDays(startOfWeek(today), 5);
    return /다음\s*주|담주/.test(text) ? addDays(sat, 7) : sat < today ? addDays(sat, 7) : sat;
  }
  return null;
}

function cleanTitle(text: string): string {
  return text
    .replace(/(다다음\s*주|다음\s*주|담주|이번\s*주)/g, '')
    .replace(/[월화수목금토일]요일/g, '')
    .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*일/g, '')
    .replace(/오늘|내일|모레|주말에?/g, '')
    .replace(/(\d+(?:\.\d+)?)\s*만\s*\d*\s*천?\s*원?|\d[\d,]*\s*원/g, '')
    .replace(/(다음|이번|다다음)\s*달(에|안에|까지|내로)?|이번\s*달/g, '')
    .replace(/짜리|살\s*거야|살거야|사려고|살\s*예정|살래|사고\s*싶어|구매할\s*거야|구매/g, '')
    .replace(/(예정|할\s*듯|할듯|있어|있음|가기로|하기로|할거야|할 거야|함|에|,)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePlan(text: string, today: Date, memory: MemoryItem[]): PlanDraft {
  const lower = text.toLowerCase();
  const found = parseDate(text, today);
  const explicit = parseAmount(text);
  const title = cleanTitle(text) || '예정 지출';

  const hits = memory.filter((m) => m.keywords.some((k) => lower.includes(k)));
  // "저녁"과 "회식"이 같이 있으면 회식 하나로 본다 (술자리 단가에 식사 포함)
  const dedup = hits.some((h) => h.id === 'm1') ? hits.filter((h) => h.id !== 'm2' && h.id !== 'm3') : hits;

  let items: DraftItem[];
  if (explicit) {
    items = [{ label: title, amount: explicit, basis: '입력한 금액을 그대로 사용했어요' }];
  } else if (dedup.length) {
    items = dedup.map((m) => ({
      label: m.label,
      amount: m.amount,
      memoryId: m.id,
      basis: m.editedByUser ? '내가 직접 수정한 금액' : `최근 6개월 ${m.label} ${m.count}회 평균`,
    }));
  } else {
    items = [{ label: title, amount: 20000, basis: '비슷한 기록이 없어 기본값을 넣었어요. 금액을 확인해 주세요' }];
  }

  const total = items.reduce((a, i) => a + i.amount, 0);
  const isLarge = (explicit ?? 0) >= 200000 || LARGE_WORDS.some((w) => text.includes(w));

  return {
    title,
    date: found ?? today,
    dateGuessed: !found,
    items,
    total,
    large: isLarge ? { amount: explicit ?? 0, title } : undefined,
  };
}
