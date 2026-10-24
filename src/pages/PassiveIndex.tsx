// 지수 시뮬레이션(시안). 지수에 매달 넣었다면: 넣은 돈·평가액, 가장 많이 줄어 있던 때, 원금으로 돌아오기까지 걸린 달, 시작한 달별 3년 결과.
// 액티브의 사건 핀 대신 '시간 축'을 보여 준다. 값은 모두 passiveSample의 고정 예시다(ADR-3).
import { Link } from 'react-router-dom';
import { LineLegend, MultiLineChart, seriesColor } from '@/charts/MultiLineChart';
import { Notice, ProtoNote, SIM_PAST } from '@/components/Proto';
import { INDEX_RESULT, INDEX_VALUE, INVESTED, MONTHLY, ROLLING, monthLabel } from '@/data/passiveSample';
import { arrow, pctTxt, upDown, won } from '@/lib/format';

const LINES = [
  { id: 'value', name: '지수에 넣었다면', colorSlot: 0, data: INDEX_VALUE },
  { id: 'invested', name: '넣은 돈', colorSlot: 3, data: INVESTED },
];

function Rate({ r }: { r: number }) {
  return (
    <span className={upDown(r)}>
      {arrow(r)} {pctTxt(r)}
    </span>
  );
}

export default function PassiveIndex() {
  const r = INDEX_RESULT;
  const ups = ROLLING.filter((x) => x.rate > 0).length;
  return (
    <section>
      <div className="page col">
        <ProtoNote />
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="page-title">지수 시뮬레이션</h1>
            <p className="page-desc">시장 전체를 담은 지수에 매달 같은 돈을 넣었다면, 얼마나 줄었다가 언제 돌아왔는지 봐요.</p>
          </div>
        </div>

        <div className="card tm-cond-summary">
          <div className="toolbar">
            <span className="chip" aria-pressed="true">
              {r.name}
            </span>
            <span className="chip">미국 S&amp;P 500 추종 ETF(국내 상장)</span>
            <span className="sub">
              매달 <b className="num">{won(MONTHLY)}원</b> · 3년({monthLabel(0)}~{monthLabel(INVESTED.length - 1)})
            </span>
            <span className="tag-ex">예시</span>
          </div>
          <span className="meta">시안에서는 첫 번째 지수의 예시 결과만 보여요</span>
        </div>

        <div className="stats pv-stats">
          <div className="stat">
            <span className="lbl">넣은 돈</span>
            <p className="val num">{won(r.invested)}원</p>
          </div>
          <div className="stat tm-stat-main">
            <span className="lbl">지금 평가액</span>
            <p className="val num">{won(r.value)}원</p>
            <span className="dl">
              <Rate r={r.rate} />
            </span>
          </div>
          <div className="stat">
            <span className="lbl">가장 많이 줄어 있던 때</span>
            <p className="val num">
              <Rate r={r.worstRate} />
            </p>
            <span className="meta">{r.worstAt} · 넣은 돈 대비</span>
          </div>
          <div className="stat">
            <span className="lbl">원금으로 돌아오기까지</span>
            <p className="val num">{r.recoverMonths}개월</p>
            <span className="meta">가장 많이 줄어 있던 때부터</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>달마다 쌓인 모양</h2>
            <span className="tag-ex">예시</span>
          </div>
          <LineLegend series={LINES} />
          <MultiLineChart
            series={LINES.map((l) => ({ id: l.id, name: l.name, colorSlot: l.colorSlot, points: l.data.map((y, x) => ({ x, y })) }))}
            xLabel={monthLabel}
            ariaLabel="지수에 매달 넣었을 때 평가액과 넣은 돈 꺾은선 그래프, 36개월"
            tooltip={(x) => (
              <>
                <div className="meta">{monthLabel(x)}</div>
                {LINES.map((l) => (
                  <div key={l.id} className="t-row">
                    <span>
                      <i className="t-key" style={{ borderColor: seriesColor(l.colorSlot) }} />
                      {l.name}
                    </span>
                    <b className="num">{won(l.data[x])}원</b>
                  </div>
                ))}
              </>
            )}
          />
          <p className="meta" style={{ marginTop: 8 }}>
            중간에 넣은 돈보다 줄어든 때가 있어도, 같은 금액을 계속 넣으면 줄어든 가격에 더 많이 사게 돼요.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>언제 시작했든: 시작한 달별 3년 뒤</h2>
            <span className="tag-ex">예시</span>
          </div>
          <p className="sub">
            같은 지수에 시작한 달만 바꿔 3년씩 매달 넣었다면, {ROLLING.length}번 중 {ups}번은 넣은 돈보다 많았어요.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>시작한 달</th>
                  <th className="r">3년 뒤 넣은 돈 대비</th>
                  <th className="r">가장 많이 줄어 있던 때</th>
                </tr>
              </thead>
              <tbody>
                {ROLLING.map((x) => (
                  <tr key={x.start}>
                    <td className="num">{x.start}</td>
                    <td className="r">
                      <Rate r={x.rate} />
                    </td>
                    <td className="r">
                      <Rate r={x.worstRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="toolbar">
          <Link className="btn btn-line" to="/mix">
            고른 종목과 반반이었다면?
          </Link>
          <Link className="btn btn-line" to="/passive/plan">
            어느 계좌에 넣을지 보기
          </Link>
        </div>
        <Notice text={SIM_PAST} />
      </div>
    </section>
  );
}
