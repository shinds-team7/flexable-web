// 대회 용어 풀이 물음표(대회 메인·대회 판 공통). 같은 설명을 카드마다 반복하지 않게 ? 툴팁에 둔다
import { useId } from 'react';
import '@/styles/contest.css';

export const TERMS = {
  excess: { label: '매매 성과', tip: '내 판 수익률에서 같은 가격 흐름에 사건마다 가만히(유지) 있었을 때의 수익률을 뺀 값이에요. 두 수익률의 차이라 %p로 보여요.' },
  boardPoints: { label: '리그 점수', tip: '지금 리그에 들어온 뒤(배치고사 또는 승급·강등 뒤) 받은 하루 점수의 합이에요. 순위의 첫 기준이고, 리그가 바뀌면 0부터 다시 세요.' },
  hold: { label: '가만히 있었다면', tip: '같은 판에서 사건마다 사고팔지 않고 유지만 했을 때의 결과예요. 매매 성과를 잴 때 기준이 돼요.' },
  today: { label: '오늘 평균', tip: '오늘 시작해 끝난 판들의 매매 성과 평균이에요. 하루가 끝나면 이 값으로 하루 점수를 정해요.' },
  week: { label: '이번 주 점수', tip: '이번 주 하루 점수의 합이에요. 주가 끝날 때 승급·강등 기준과 비교해요.' },
} as const;
export type TermKey = keyof typeof TERMS;

export function Term({ k, label }: { k: TermKey; label?: string }) {
  const id = useId();
  return <span className="contest-term">{label ?? TERMS[k].label}<span className="contest-tip-wrap">
    <button type="button" className="contest-tip-mark" aria-label={`${TERMS[k].label} 뜻`} aria-describedby={id}>?</button>
    <span id={id} role="tooltip" className="contest-tip">{TERMS[k].tip}</span>
  </span></span>;
}
