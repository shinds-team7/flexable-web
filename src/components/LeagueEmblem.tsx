// 대회 리그 엠블럼(장식, 대회 메인·대회 판 공통). 색은 contest.css의 토큰만 쓴다
import { BOARDS, type ContestBoard } from '@/data/virtualContest';

/** 리그 엠블럼(장식): 방패 + 별 개수(1천만 1개 · 5천만 2개 · 1억 3개). 이름은 옆 글자로 읽는다 */
export function LeagueEmblem({ board, size = 40 }: { board: ContestBoard; size?: number }) {
  const stars = BOARDS.indexOf(board) + 1;
  const xs = stars === 1 ? [20] : stars === 2 ? [14, 26] : [10, 20, 30];
  return <svg className={`contest-emblem tier-${stars}`} viewBox="0 0 40 44" width={size} height={size * 1.1} aria-hidden="true" focusable="false">
    <path className="contest-emblem-shield" d="M20 2 37 8v13c0 10.5-7.2 18.2-17 21C10.2 39.2 3 31.5 3 21V8Z" />
    <path className="contest-emblem-rim" d="M20 6.5 33 11v10c0 8.2-5.4 14.4-13 16.8C12.4 35.4 7 29.2 7 21V11Z" />
    {xs.map(x => <path key={x} className="contest-emblem-star" transform={`translate(${x - 20} ${stars === 3 && x === 20 ? -3 : 0})`} d="m20 14 2.2 4.5 5 .7-3.6 3.5.9 4.9-4.5-2.3-4.5 2.3.9-4.9-3.6-3.5 5-.7Z" />)}
  </svg>;
}
