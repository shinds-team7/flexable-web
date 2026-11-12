// 지갑의 평단가 두 줄(과거 시장 연습·가상 시뮬레이션·대회 판 공통, policies §5 "평단가", decisions/2026-11-11-contest-ux-redesign 6).
// 평단가는 서버 값(averagePrice)이고, 지금 종가 대비는 1주당 원 차이(종가 − 평단가)를 보여 주기만 한다. 비율은 나누지 않는다.
const fmt = new Intl.NumberFormat('ko-KR');

/** averagePrice: 서버 평단가(보유 0주면 null), close: 지금 보이는 봉의 종가. 둘 다 없으면(시작 전) 대시 */
export function AveragePriceRows({ averagePrice, close }: { averagePrice: number | null | undefined; close: number | null | undefined }) {
  if (averagePrice === undefined || close == null) {
    return <div><dt>평단가</dt><dd>—</dd></div>;
  }
  if (averagePrice === null) return <div><dt>평단가</dt><dd className="practice-muted">보유 없음</dd></div>;
  const gap = close - averagePrice;
  const cls = gap > 0 ? 'practice-rise' : gap < 0 ? 'practice-fall' : '';
  return <>
    <div><dt>평단가</dt><dd>{fmt.format(averagePrice)}원</dd></div>
    <div className="practice-avg-gap"><dt>지금 종가 대비</dt><dd className={cls}>{gap > 0 ? '▲ ' : gap < 0 ? '▼ ' : ''}{fmt.format(Math.abs(gap))}원<small> / 1주</small></dd></div>
  </>;
}
