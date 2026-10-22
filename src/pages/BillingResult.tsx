// 모의 결제 결과(/billing/result). 설계: 01-product F6, 02-design §5-12, 와이어프레임 「모의 결제 결과」.
// 결제 전 확인 → 완료·실패·취소, 내 정보의 해지 확인 → 유지·해지 완료. 단계는 주소의 step으로 나눈다(data/billing.ts).
// 모의 결제라 계정·브라우저 어디에도 요금제를 저장하지 않는다. 모든 단계에 실제 청구·요금제 변경이 없다는 말을 붙인다.
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '@/components/Icons';
import { billingPath, mockPlanUntil, readBillingView, type BillingStep } from '@/data/billing';
import { usePlans, type Period } from '@/data/plans';
import { won } from '@/lib/format';

const PERIOD_TEXT: Record<Period, { name: string; cycle: string }> = {
  YEARLY: { name: '연간', cycle: '1년마다' },
  MONTHLY: { name: '월간', cycle: '매달' },
};

/** "2027-10-22" → "2027년 10월 22일" */
const fullDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};

export default function BillingResult() {
  const [sp] = useSearchParams();
  const view = readBillingView(sp);
  const plans = usePlans();
  const navigate = useNavigate();
  const period: Period = view.period ?? plans.data?.defaultPeriod ?? 'YEARLY';
  const price = plans.data?.prices[period];
  const priceText = price ? `${price.unit === '년' ? '연' : '월'} ${won(price.amount)}원` : '';
  const go = (step: BillingStep) => navigate(billingPath(step, period), { replace: true });

  // 단계가 바뀌면 제목으로 포커스를 옮겨 화면 읽기 프로그램이 결과를 읽게 한다
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headRef.current?.focus();
  }, [view.step]);

  const head = (title: string, tone?: 'ok' | 'bad') => (
    <div className={'bill-head' + (tone ? ' ' + tone : '')}>
      {tone && (
        <span className="bill-icon" aria-hidden="true">
          <Icon id={tone === 'ok' ? 'i-check' : 'i-info'} size={20} />
        </span>
      )}
      <h1 ref={headRef} tabIndex={-1} className="bill-title">
        {title}
      </h1>
    </div>
  );

  let body: React.ReactNode;
  switch (view.step) {
    case 'confirm':
      body = (
        <>
          {head('플러스 결제')}
          <div className="bill-rows">
            <div className="set-row">
              <span className="k">요금제</span>
              <span className="v">플러스 · {PERIOD_TEXT[period].name}</span>
            </div>
            <div className="set-row">
              <span className="k">결제 금액</span>
              <span className="v num">{price ? `${won(price.amount)}원` : '불러오는 중…'}</span>
            </div>
            <div className="set-row">
              <span className="k">결제 주기</span>
              <span className="v">{PERIOD_TEXT[period].cycle} · 언제든 해지</span>
            </div>
          </div>
          <p className="disclaimer">
            <Icon id="i-info" size={16} />
            <span>시연용 모의 결제예요. 아래 버튼으로 결과 화면만 볼 수 있고, 실제로 돈이 나가거나 요금제가 바뀌지 않아요.</span>
          </p>
          <div className="bill-acts">
            <button type="button" className="btn btn-primary" onClick={() => go('success')} disabled={!price}>
              결제 완료 시연
            </button>
            <button type="button" className="btn btn-line" onClick={() => go('fail')} disabled={!price}>
              결제 실패 시연
            </button>
            <button type="button" className="btn btn-line" onClick={() => go('cancel')}>
              취소
            </button>
          </div>
          <Link className="btn-text bill-back" to="/plus">
            요금 다시 고르기
          </Link>
        </>
      );
      break;
    case 'success':
      body = (
        <>
          {head('플러스를 시작했어요', 'ok')}
          <p className="bill-main num">
            {fullDate(mockPlanUntil(period))}까지{priceText && ` · ${priceText}`}
          </p>
          <p className="disclaimer">
            <Icon id="i-info" size={16} />
            <span>모의 결제 결과예요. 실제로 청구되지 않았고, 계정 요금제는 무료 그대로예요.</span>
          </p>
          <div className="bill-acts">
            <Link className="btn btn-primary" to="/home">
              홈으로
            </Link>
            <Link className="btn btn-line" to="/plus">
              요금표로
            </Link>
          </div>
        </>
      );
      break;
    case 'fail':
      body = (
        <>
          {head('결제가 되지 않았어요', 'bad')}
          <p className="bill-main">{view.failMessage ?? '예시 사유: 카드사에서 결제를 승인하지 않았어요'}</p>
          {view.failCode && <p className="meta">오류 코드 {view.failCode}</p>}
          <p className="disclaimer">
            <Icon id="i-info" size={16} />
            <span>모의 결제 결과예요. 돈이 나가지 않았고 요금제도 바뀌지 않았어요.</span>
          </p>
          <div className="bill-acts">
            <button type="button" className="btn btn-primary" onClick={() => go('confirm')}>
              다시 시도
            </button>
            <Link className="btn btn-line" to="/plus">
              요금 다시 고르기
            </Link>
          </div>
        </>
      );
      break;
    case 'cancel':
      body = (
        <>
          {head('결제를 취소했어요')}
          <p className="bill-main">요금제는 그대로예요. 돈도 나가지 않았어요.</p>
          <div className="bill-acts">
            <Link className="btn btn-primary" to="/plus">
              요금표로
            </Link>
            <Link className="btn btn-line" to="/home">
              홈으로
            </Link>
          </div>
        </>
      );
      break;
    case 'revoke':
      body = (
        <>
          {head('플러스를 해지할까요?')}
          <p className="bill-main">해지해도 이미 결제한 기간이 끝날 때까지는 계속 쓸 수 있어요. 다음 결제부터 청구되지 않아요.</p>
          <p className="disclaimer">
            <Icon id="i-info" size={16} />
            <span>해지 흐름을 보여 주는 시연 화면이에요. 모의 결제는 요금제를 저장하지 않아 실제로 바뀌는 것은 없어요.</span>
          </p>
          <div className="bill-acts">
            <Link className="btn btn-primary" to="/me">
              계속 쓰기
            </Link>
            <button type="button" className="btn btn-line" onClick={() => go('revoked')}>
              해지하기
            </button>
          </div>
        </>
      );
      break;
    case 'revoked':
      body = (
        <>
          {head('해지했어요', 'ok')}
          <p className="bill-main">결제한 기간이 끝나면 무료로 바뀌어요. 다시 쓰고 싶으면 플러스에서 언제든 시작할 수 있어요.</p>
          <p className="disclaimer">
            <Icon id="i-info" size={16} />
            <span>모의 해지 결과예요. 실제 청구·환불은 없어요.</span>
          </p>
          <div className="bill-acts">
            <Link className="btn btn-primary" to="/me">
              내 정보로
            </Link>
            <Link className="btn btn-line" to="/plus">
              요금표로
            </Link>
          </div>
        </>
      );
      break;
  }

  return (
    <section>
      <div className="page bill-page">
        <div className="card bill-card" role="region" aria-label="모의 결제">
          <p className="bill-badge">모의 결제 · 실제 청구 없음</p>
          {body}
        </div>
      </div>
    </section>
  );
}
