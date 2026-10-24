// 반반 실험(시안). 같은 돈을 지수(패시브)와 고른 종목(액티브)에 나눠 넣었다면: 비율별 평가액·가장 많이 줄어 있던 때.
// 액티브와 패시브를 잇는 화면이라 상단 메뉴에는 두지 않고 두 '~란?' 화면과 지수 시뮬레이션에서 연결한다. 값은 고정 예시다(ADR-3).
import { useState } from 'react';
import { LineLegend, MultiLineChart, seriesColor } from '@/charts/MultiLineChart';
import { Notice, ProtoNote, SIM_PAST } from '@/components/Proto';
import { ACTIVE_VALUE, INDEX_VALUE, INVESTED, MIX50_VALUE, MIX_RATIOS, monthLabel } from '@/data/passiveSample';
import { arrow, pctTxt, upDown, won } from '@/lib/format';

const LINES = [
  { id: 'index', name: '지수만', colorSlot: 0, data: INDEX_VALUE },
  { id: 'mix', name: '반반', colorSlot: 1, data: MIX50_VALUE },
  { id: 'active', name: '고른 종목만', colorSlot: 2, data: ACTIVE_VALUE },
  { id: 'invested', name: '넣은 돈', colorSlot: 3, data: INVESTED },
];
const invested = INVESTED[INVESTED.length - 1];
const ratioLabel = (a: number) => (a === 0 ? '패시브만' : a === 100 ? '액티브만' : `${100 - a} : ${a}`);

function Rate({ r }: { r: number }) {
  return (
    <span className={upDown(r)}>
      {arrow(r)} {pctTxt(r)}
    </span>
  );
}

export default function Mix() {
  const [active, setActive] = useState(50);
  const sel = MIX_RATIOS.find((m) => m.active === active) ?? MIX_RATIOS[2];
  return (
    <section>
      <div className="page col">
        <ProtoNote />
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="page-title">반반 실험</h1>
            <p className="page-desc">같은 돈을 패시브(지수)와 액티브(고른 종목)에 나눠 넣었다면 어땠을지 비율별로 봐요.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>패시브 : 액티브 비율</h2>
            <span className="tag-ex">예시</span>
          </div>
          <div className="seg fill" role="group" aria-label="비율">
            {MIX_RATIOS.map((m) => (
              <button key={m.active} aria-pressed={m.active === active} onClick={() => setActive(m.active)}>
                {ratioLabel(m.active)}
              </button>
            ))}
          </div>
          <div className="stats" style={{ marginTop: 16 }}>
            <div className="stat">
              <span className="lbl">넣은 돈</span>
              <p className="val num">{won(invested)}원</p>
              <span className="meta">매달 78,000원 · 3년</span>
            </div>
            <div className="stat tm-stat-main">
              <span className="lbl">지금 평가액</span>
              <p className="val num">{won(sel.value)}원</p>
            </div>
            <div className="stat">
              <span className="lbl">가장 많이 줄어 있던 때</span>
              <p className="val num">
                <Rate r={sel.worstRate} />
              </p>
              <span className="meta">{sel.worstAt} · 넣은 돈 대비</span>
            </div>
          </div>
          <p className="meta" style={{ marginTop: 12 }}>
            비율을 정해 두면 한쪽이 크게 흔들려도 전체가 얼마나 줄어들지 미리 가늠할 수 있어요. 고른 종목은 예시 종목 묶음이에요.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>세 가지를 나란히</h2>
          </div>
          <LineLegend series={LINES} />
          <MultiLineChart
            series={LINES.map((l) => ({ id: l.id, name: l.name, colorSlot: l.colorSlot, points: l.data.map((y, x) => ({ x, y })) }))}
            xLabel={monthLabel}
            ariaLabel="지수만, 반반, 고른 종목만 평가액과 넣은 돈 꺾은선 그래프, 36개월"
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
        </div>

        <div className="card">
          <div className="card-head">
            <h2>비율별 결과</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>패시브 : 액티브</th>
                  <th className="r">지금 평가액</th>
                  <th className="r">가장 많이 줄어 있던 때</th>
                </tr>
              </thead>
              <tbody>
                {MIX_RATIOS.map((m) => (
                  <tr key={m.active} className={m.active === active ? 'sel' : ''}>
                    <td>{ratioLabel(m.active)}</td>
                    <td className="r num">{won(m.value)}원</td>
                    <td className="r">
                      <Rate r={m.worstRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Notice text={SIM_PAST} />
      </div>
    </section>
  );
}
