// 계좌 알아보기(시안). 패시브에 쓰는 계좌를 같은 항목으로 나란히: 계좌 비교 표 · CMA 종류 · 급할 때 꺼내는 순서.
// 순위·추천·가입 버튼은 두지 않는다(01 §7 R2). 한도·세율은 2026-10 기준 확인 전 예시다.
import { Notice, PRODUCT_CARD, ProtoNote } from '@/components/Proto';
import { ACCOUNTS, CMA_TYPES, EMERGENCY_STEPS } from '@/data/passiveSample';

export default function PassiveAccounts() {
  return (
    <section>
      <div className="page col">
        <ProtoNote />
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="page-title">계좌 알아보기</h1>
            <p className="page-desc">패시브 투자에 쓰는 계좌를 같은 항목으로 나란히 봐요. 표의 순서는 돈이 흘러가는 순서예요.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>계좌 한눈에</h2>
            <span className="tag-ex">확인 전</span>
          </div>
          <div className="table-wrap">
            <table className="acct-table">
              <thead>
                <tr>
                  <th>계좌</th>
                  <th>무엇에 쓰나</th>
                  <th>한도</th>
                  <th>세금</th>
                  <th>급할 때 꺼내기</th>
                  <th>여는 곳</th>
                </tr>
              </thead>
              <tbody>
                {ACCOUNTS.map((a) => (
                  <tr key={a.name}>
                    <th scope="row">{a.name}</th>
                    <td>{a.use}</td>
                    <td>{a.limit}</td>
                    <td>{a.tax}</td>
                    <td>{a.withdraw}</td>
                    <td>{a.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="g84">
          <div className="card">
            <div className="card-head">
              <h2>CMA는 종류가 있어요</h2>
            </div>
            <p className="sub">돈을 어디에 넣어 두느냐에 따라 나뉘고, 금리가 조금씩 달라요. 예금자보호 대상은 아니에요. 금리는 증권사 앱에서 확인해 주세요.</p>
            <div className="cma-types">
              {CMA_TYPES.map((c) => (
                <div key={c.name} className="card-sunken">
                  <b>{c.name}</b>
                  <p className="sub">{c.what}</p>
                  <p className="meta">
                    {c.note} · {c.open}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>급할 때 꺼내는 순서</h2>
              <span className="tag-ex">예시</span>
            </div>
            <ol className="steps">
              {EMERGENCY_STEPS.map((s) => (
                <li key={s.title}>
                  <b>{s.title}</b>
                  <span className="meta">{s.desc}</span>
                </li>
              ))}
            </ol>
            <p className="meta" style={{ marginTop: 12 }}>
              ISA는 원금을 꺼낼 수 있어서 비상금을 따로 두지 않는 사람도 있어요. 큰 위험은 보험으로 대비하는 방법을 함께 써요.
            </p>
          </div>
        </div>

        <Notice text={PRODUCT_CARD} />
      </div>
    </section>
  );
}
