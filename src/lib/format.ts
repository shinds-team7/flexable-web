// 금액·날짜 표시 도구(와이어프레임 스크립트에서 옮김). 금액 계산은 서버가 하고, 여기서는 표시만 한다.
export const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const signWon = (n: number) => (n >= 0 ? '+' : '−') + won(Math.abs(n)) + '원';
export const pctTxt = (x: number, d = 1) => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%';
export const arrow = (x: number) => (x >= 0 ? '▲' : '▼');
export const upDown = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : 'flat');

export function krShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1e8) return (n / 1e8).toFixed(a % 1e8 ? 1 : 0) + '억';
  if (a >= 1e4) return Math.round(n / 1e4).toLocaleString('ko-KR') + '만';
  return String(Math.round(n));
}

export function niceTicks(min: number, max: number, count = 4) {
  if (max - min < 1) max = min + 1;
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const t: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(v);
  return t;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (d: Date) => `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
export const fmtYM = (d: Date) => `${d.getFullYear()}.${pad2(d.getMonth() + 1)}`;
/** 서버 시각("2026-10-20T18:05:00+09:00", 한국 시각으로 내려옴) → "10월 20일 18:05". 브라우저 시간대와 관계없이 적힌 시각 그대로 쓴다. */
export const fmtMonthDayTime = (iso: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일 ${m[3]}:${m[4]}` : iso;
};
/** "2026-10-17" → "10월 17일" */
export const fmtMonthDay = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}월 ${d}일`;
};
