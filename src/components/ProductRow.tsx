// 상품 한 줄: 은행 아이콘 · 상품명·은행·태그 · 최고(파랑, 크게)/기본 금리 · 만기 수령액 · 비교 체크. 줄을 누르면 아래에 상세가 열린다.
import type { ReactNode } from 'react';
import { BankBadge } from '@/components/BankBadge';
import { won } from '@/lib/format';

export type RowProduct = {
  id: string;
  name: string;
  company: string;
  baseRate: number;
  maxRate: number;
  result: { maturityAmount: number; interestAfterTax: number; excludedAmount: number };
};

const pct = (r: number) => r.toFixed(2) + '%';

export function ProductRow({
  p,
  tags,
  open,
  onToggle,
  checked,
  onCheck,
  detail,
}: {
  p: RowProduct;
  tags: string[];
  open: boolean;
  onToggle: () => void;
  checked: boolean;
  onCheck: (on: boolean) => void;
  detail: ReactNode;
}) {
  return (
    <li className={'pr' + (open ? ' open' : '')}>
      <div className="pr-main" onClick={onToggle}>
        <BankBadge name={p.company} size={48} />
        <div className="pr-info">
          <button
            type="button"
            className="pr-name"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {p.name}
          </button>
          <p className="pr-co">{p.company}</p>
          {tags.length > 0 && (
            <p className="pr-tags">
              {tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="pr-rate">
          <p className="pr-max">
            최고 <b className="num">{pct(p.maxRate)}</b>
          </p>
          <p className="pr-base">
            기본 <span className="num">{pct(p.baseRate)}</span>
          </p>
        </div>
        <div className="pr-got">
          <p className="meta">만기 세후 수령액</p>
          <p className="pr-got-val num">{won(p.result.maturityAmount)}원</p>
          <p className="meta num">이자 {won(p.result.interestAfterTax)}원</p>
          {p.result.excludedAmount > 0 && <p className="meta">한도 초과 {won(p.result.excludedAmount)}원은 넣지 못함</p>}
        </div>
        <label className="pr-cmp" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" className="sv-cmp" aria-label={`${p.name} 비교에 넣기`} checked={checked} onChange={(e) => onCheck(e.target.checked)} />
          비교
        </label>
      </div>
      {open && <div className="pr-detail">{detail}</div>}
    </li>
  );
}
