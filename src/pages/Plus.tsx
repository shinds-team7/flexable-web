// 플러스: 제목(플랜 업그레이드) → 월간/연간 전환 → 무료·플러스 카드 2장 → 전체 비교 → 자주 묻는 질문.
// 월간이 기본 선택. 모의 결제라 실제 청구가 없다는 말을 결제 전에 보여 준다(01-product F6, 02-design §5-8).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { Icon } from '@/components/Icons';
import { startCheckout } from '@/data/billing';
import { usePlans, useSubscription, type Period, type PlanFeature, type Plans } from '@/data/plans';
import { won } from '@/lib/format';

function FeatureList({ items }: { items: PlanFeature[] }) {
  return (
    <ul className="plan-feats">
      {items.map((f) => (
        <li key={f.title}>
          <span className="plan-check">
            <Icon id="i-check" size={16} />
          </span>
          <div>
            <p className="k">{f.title}</p>
            <p className="meta">{f.desc}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PlanCards({ plans, period }: { plans: Plans; period: Period }) {
  const { status } = useSession();
  const sub = useSubscription(status === 'member');
  const navigate = useNavigate();
  const price = plans.prices[period];
  const isPlus = sub.data?.plan === 'PLUS';
  const isFree = status === 'member' && sub.data?.plan === 'FREE';

  const start = () => startCheckout(period, navigate);

  return (
    <div className="plan-cards">
      <article className="card plan-card" aria-labelledby="planFree">
        <div className="plan-top">
          <p className="plan-eyebrow muted">기본</p>
        </div>
        <h2 id="planFree" className="plan-name">무료</h2>
        <p className="plan-price num">
          <b>0원</b>
        </p>
        <p className="meta">결과는 무료로도 끝까지 볼 수 있어요</p>
        {status === 'member' ? (
          <button className="btn btn-line btn-block plan-cta" disabled>
            {isFree ? '지금 쓰는 요금제' : '무료 요금제'}
          </button>
        ) : (
          <button className="btn btn-line btn-block plan-cta" onClick={() => navigate('/home')} disabled={status === 'loading'}>
            무료로 시작하기
          </button>
        )}
        <FeatureList items={plans.freeFeatures} />
      </article>

      <article className="card plan-card plan-pick" aria-labelledby="planPlus">
        <div className="plan-top">
          <p className="plan-eyebrow">대표 가치 · 정책 마감 리마인더</p>
          {period === 'YEARLY' && <span className="plan-badge">연간 {won(plans.yearlySaving)}원 아껴요</span>}
        </div>
        <h2 id="planPlus" className="plan-name">플러스</h2>
        <p className="plan-price num">
          <b>{won(price.amount)}원</b>
          <span>/{price.unit}</span>
        </p>
        <p className="meta">{period === 'YEARLY' ? '1년에 한 번 결제 · 언제든 해지' : '매달 결제 · 언제든 해지'}</p>
        <button className="btn btn-primary btn-block plan-cta" onClick={start} disabled={isPlus || status === 'loading'}>
          {isPlus ? '지금 쓰는 요금제' : status === 'member' ? `${price.unit === '년' ? '연' : '월'} ${won(price.amount)}원으로 시작` : '로그인 없이 플러스 체험하기'}
        </button>
        <FeatureList items={plans.plusFeatures} />
        <hr className="hair" />
        <p className="meta">무료 기능도 모두 그대로 쓸 수 있어요.</p>
      </article>
    </div>
  );
}

export default function Plus() {
  const plans = usePlans();
  const [period, setPeriod] = useState<Period | null>(null);
  const cur = period ?? plans.data?.defaultPeriod ?? 'MONTHLY';
  const periods: { v: Period; label: string }[] = [
    { v: 'MONTHLY', label: '월간' },
    { v: 'YEARLY', label: '연간' },
  ];

  return (
    <section>
      <div className="page plus-page">
        <header className="plus-head">
          <h1 className="plus-title">플랜 업그레이드</h1>
        </header>

        <div className="period-switch">
          <div className="seg plus-seg" role="group" aria-label="결제 주기">
            {periods.map((p) => (
              <button key={p.v} aria-pressed={cur === p.v} onClick={() => setPeriod(p.v)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {plans.isPending && <div className="plan-cards" aria-busy="true" />}
        {plans.isError && (
          <div className="error-box">
            <h3>요금 정보를 불러오지 못했어요</h3>
            <button className="btn btn-line btn-sm" onClick={() => plans.refetch()}>
              다시 시도
            </button>
          </div>
        )}
        {plans.data && (
          <>
            <PlanCards plans={plans.data} period={cur} />

            <details className="card plan-compare">
              <summary>무료와 플러스 전체 비교</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>기능</th>
                      <th>무료</th>
                      <th>플러스</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.data.compare.map((r) => (
                      <tr key={r.feature}>
                        <td>{r.feature}</td>
                        <td className="nw">{r.free}</td>
                        <td className="nw">{r.plus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="meta" style={{ marginTop: 12 }}>
                한도 숫자는 서비스 설정에 따라 바뀔 수 있어요. 종목 판단·전망은 무료·플러스 어디에도 없어요.
              </p>
            </details>

            <div className="card plan-faq">
              <h2>자주 묻는 질문</h2>
              <details>
                <summary>해지는 어떻게 해요?</summary>
                <p>내 정보 → 구독 → 해지를 누르고 한 번 더 확인하면 끝나요. 결제한 기간이 끝날 때까지는 계속 쓸 수 있어요.</p>
              </details>
              <details>
                <summary>지금 결제하면 돈이 나가나요?</summary>
                <p>아니요. 지금은 시연용 모의 결제라 실제로 청구되지 않고, 결과 화면만 보여 줄 뿐 요금제도 바뀌지 않아요. 실제 결제 수단과 환불 정책은 출시 전에 정해서 알려 드려요.</p>
              </details>
              <details>
                <summary>무료로는 어디까지 볼 수 있어요?</summary>
                <p>첫 결과는 막지 않아요. 소식, 투자 시뮬레이션의 사건 설명, 적금·정책 적금 비교는 모두 무료예요. 저장 개수와 정밀 모드, 리마인더·리포트만 플러스예요.</p>
              </details>
              <details>
                <summary>앱에서도 결제할 수 있어요?</summary>
                <p>플러스는 웹에서만 시작할 수 있어요. 앱 안에는 가격이나 결제 화면이 없어요.</p>
              </details>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
