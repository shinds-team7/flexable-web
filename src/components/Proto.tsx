// 투자 성향 시연 화면의 공통 부품(docs/product/proposal-investor-type.md). 팀 동의 전 화면이라 위에 '시안' 안내를 붙인다.
import { Link } from 'react-router-dom';
import { Icon } from './Icons';

export const SIM_PAST = '과거 가격으로 계산한 가상의 결과예요. 앞으로도 그렇다는 뜻이 아니고, 투자 권유가 아니에요. 실제 투자는 원금을 잃을 수 있어요.';
export const PRODUCT_CARD = '상품 유형의 일반적인 설명이에요. 실제 조건은 가입하려는 상품의 설명서에서 확인해 주세요.';

export function ProtoNote() {
  return (
    <div className="proto-note" role="note">
      <b>시안</b>
      <span>시연용 화면이에요. '예시' 표시가 붙은 숫자는 예시이고, 실제 계산은 서버에 붙여요.</span>
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
