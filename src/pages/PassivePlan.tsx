// 계좌 설계(시안). 매달 모으는 돈이 은행 → CMA → ISA·연금 계좌로 흘러가는 길을 단계별 예시로 보여 준다.
// 사용자에게 배분을 정해 주지 않는다. 단계는 '많이 알려진 방식의 예시'이고, 세액공제 금액은 미리 계산한 예시다(ADR-3).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice, ProtoNote } from '@/components/Proto';
import { PLAN_STAGES } from '@/data/passiveSample';
import { won } from '@/lib/format';

const man = (n: number) => `${won(n / 10000)}만 원`;

export default function PassivePlan() {
  const [id, setId] = useState(PLAN_STAGES[0].id);
  const st = PLAN_STAGES.find((s) => s.id === id) ?? PLAN_STAGES[0];
  const top = Math.max(...st.accounts.map((a) => a.monthly));
  return (
    <section>
      <div className="page col">
        <ProtoNote />
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="page-title">계좌 설계</h1>
            <p className="page-desc">매달 모으는 돈이 어느 계좌로 흘러가는지, 많이 알려진 방식을 단계별 예시로 봐요.</p>
          </div>
          <div className="seg" role="group" aria-label="단계">
            {PLAN_STAGES.map((s) => (
              <button key={s.id} aria-pressed={s.id === id} onClick={() => setId(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>
              월급 {man(st.salary)} 중 {man(st.saving)}을 모을 때
            </h2>
            <span className="tag-ex">예시</span>
          </div>
          <div className="flow">
            <div className="flow-node">
              <span className="lbl">월급날</span>
              <b>은행 통장</b>
              <p className="meta">월급을 받고 카드값·자동이체가 빠져요. 월급을 은행으로 받으면 대출 금리 우대를 받을 수 있어요.</p>
            </div>
            <span className="flow-arrow" aria-hidden="true">
              →
            </span>
            <div className="flow-node">
              <span className="lbl">다음 날</span>
              <b>CMA</b>
              <p className="meta">남은 돈을 옮겨 두면 하루 단위로 이자를 받으며 기다려요.</p>
            </div>
            <span className="flow-arrow" aria-hidden="true">
              →
            </span>
            <div className="flow-node wide">
              <span className="lbl">모으는 계좌</span>
              <ul className="flow-accts">
                {st.accounts.map((a) => (
                  <li key={a.name}>
                    <div className="row-between">
                      <b>{a.name}</b>
                      <b className="num">월 {man(a.monthly)}</b>
                    </div>
                    <div className="bar" aria-hidden="true">
                      <i style={{ width: `${Math.round((a.monthly / top) * 100)}%` }} />
                    </div>
                    <span className="meta">{a.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="g84">
          <div className="card">
            <h2>이 단계에서 알아 둘 것</h2>
            <ul className="plan-notes">
              {st.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="meta" style={{ marginTop: 12 }}>
              계좌마다 한도·세금·꺼내는 방법은 <Link to="/passive/accounts">계좌 알아보기</Link>에서 나란히 볼 수 있어요.
            </p>
          </div>
          <div className="card col" style={{ gap: 8 }}>
            <span className="lbl meta">연말정산 때 돌려받는 돈</span>
            <p className="hero-num num" style={{ fontSize: 32, lineHeight: '40px' }}>
              {won(st.taxBack)}
              <small>원</small>
            </p>
            <span className="meta">{st.taxBasis}</span>
            <span className="tag-ex" style={{ alignSelf: 'flex-start' }}>
              예시
            </span>
          </div>
        </div>

        <Notice text="많이 알려진 방식을 예시로 보여 드려요. 내 상황에 맞는지는 직접 판단해 주세요. 투자 권유가 아니에요." />
      </div>
    </section>
  );
}
