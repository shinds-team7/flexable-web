// 액티브·패시브 구분 시안의 공통 부품. 팀 동의 전 화면이라 모든 화면 위에 '시안' 안내를 붙인다.
import { Link } from 'react-router-dom';
import { Icon } from './Icons';

export const SIM_PAST = '과거 가격으로 계산한 가상의 결과예요. 앞으로도 그렇다는 뜻이 아니고, 투자 권유가 아니에요. 실제 투자는 원금을 잃을 수 있어요.';
export const PRODUCT_CARD = '상품 유형의 일반적인 설명이에요. 실제 조건은 가입하려는 상품의 설명서에서 확인해 주세요.';

export function ProtoNote() {
  return (
    <div className="proto-note" role="note">
      <b>시안</b>
      <span>팀 논의용 화면이에요. 숫자는 모두 예시이고, 실제 계산은 팀이 동의한 뒤 서버에 붙여요.</span>
    </div>
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <p className="disclaimer">
      <Icon id="i-info" size={14} />
      {text}
    </p>
  );
}

const WAYS = [
  { k: '하는 일', active: '종목을 직접 고른다', passive: '시장 전체(지수)를 정해진 금액으로 매달 산다' },
  { k: '사람이 몰리면', active: '내 몫이 줄어들기 쉽다', passive: '같이 간다' },
  { k: '중요한 것', active: '무엇을, 언제', passive: '얼마나 오래, 어떤 계좌에' },
  { k: '보는 숫자', active: '그때 무슨 일이 있었나(사건)', passive: '가장 많이 줄어 있던 때, 원금으로 돌아오기까지 걸린 시간' },
  { k: '이 사이트에서', active: '투자 시뮬레이션 · 분산 투자', passive: '지수 시뮬레이션 · 계좌 설계 · 계좌 알아보기 · 적금 모아보기' },
];

/** 두 방식 한눈에. side로 지금 보는 쪽 열을 강조한다. */
export function WaysTable({ side }: { side: 'active' | 'passive' }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>액티브와 패시브, 한눈에</h2>
      </div>
      <div className="table-wrap">
        <table className="ways-table">
          <thead>
            <tr>
              <th />
              <th className={side === 'active' ? 'on' : ''}>액티브 · 골라서 투자</th>
              <th className={side === 'passive' ? 'on' : ''}>패시브 · 시장 전체에 꾸준히</th>
            </tr>
          </thead>
          <tbody>
            {WAYS.map((w) => (
              <tr key={w.k}>
                <th scope="row">{w.k}</th>
                <td className={side === 'active' ? 'on' : ''}>{w.active}</td>
                <td className={side === 'passive' ? 'on' : ''}>{w.passive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 16 }}>
        <Link className="btn btn-line btn-sm" to={side === 'active' ? '/passive' : '/active'}>
          {side === 'active' ? '패시브 투자 보기' : '액티브 투자 보기'}
        </Link>
      </div>
    </div>
  );
}

export function MixCard() {
  return (
    <Link className="card mix-card" to="/mix">
      <span className="tag">두 방식 잇기</span>
      <h2>반반 실험</h2>
      <p className="sub">같은 돈을 지수와 고른 종목에 나눠 넣었다면 어땠을지 비율을 바꿔 가며 봐요.</p>
      <span className="btn-text">반반 실험 열기 →</span>
    </Link>
  );
}

export type LinkCardItem = { to: string; title: string; desc: string };

export function LinkCards({ items }: { items: LinkCardItem[] }) {
  return (
    <div className="link-cards">
      {items.map((it) => (
        <Link key={it.to} className="card link-card" to={it.to}>
          <h3>{it.title}</h3>
          <p className="sub">{it.desc}</p>
          <span className="btn-text">열기 →</span>
        </Link>
      ))}
    </div>
  );
}
