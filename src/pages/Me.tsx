// 내 정보: 계정·앱 연동·구독(모의 결제, 저장 없음)·로그아웃·탈퇴.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLinkCard } from '@/components/AppLinkCard';
import { useLoginModal } from '@/components/LoginModal';
import { usePlans } from '@/data/plans';
import { won } from '@/lib/format';
import { useSession } from '@/auth/session';
import { api, errorText } from '@/lib/api';

const PROVIDER: Record<string, string> = { email: '이메일', kakao: '카카오', google: 'Google' };
const WITHDRAW_CONFIRM = '탈퇴';

export default function Me() {
  const { status, user, signOut, clearSession } = useSession();
  const { openLogin } = useLoginModal();
  const guest = status === 'guest';
  const navigate = useNavigate();
  return (
    <section>
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="col">
          <div className="card">
            <h2>계정</h2>
            <div className="set-row">
              <span>
                <span className="k">로그인 방법</span>{' '}
                <span className="v">{guest ? '로그인 없이 체험 중' : user ? PROVIDER[user.provider] : '확인 중'}</span>
              </span>
              <span>
                <span className="k">이메일</span>{' '}
                <span className="v">{guest ? '체험 내용은 계정에 저장되지 않아요' : user?.email ?? '이메일 없음'}</span>
              </span>
            </div>
          </div>
          <AppLinkCard member={status === 'member'} />
          <SubscriptionCard />
          {guest ? (
            <div className="card">
              <p className="k">로그인 없이 체험 중</p>
              <p className="v">예시 데이터로 둘러보고 있어요. 내 계정으로 이용하려면 로그인해 주세요.</p>
              <button type="button" className="btn btn-line btn-sm" onClick={() => openLogin('/mypage/settings')}>로그인</button>
            </div>
          ) : status === 'member' && user && (
            <AccountActions
              social={user.provider !== 'email'}
              onSignOut={async () => {
                await signOut();
                navigate('/', { replace: true });
              }}
              onDone={() => {
                clearSession();
                navigate('/', { replace: true });
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function SubscriptionCard() {
  const [compare, setCompare] = useState(false);
  const plans = usePlans();

  return (
    <section className="card settings-subscription" aria-labelledby="subscription-title">
      <h2 id="subscription-title">구독</h2>
      <div className="seg fill settings-plan-toggle" role="group" aria-label="요금제 비교">
        <button type="button" aria-pressed={!compare} onClick={() => setCompare(false)}>무료</button>
        <button type="button" aria-pressed={compare} aria-expanded={compare} aria-controls="settings-plan-compare"
          onClick={() => setCompare((value) => !value)}>플러스</button>
      </div>
      <p className="meta">현재 무료 요금제예요. 플러스는 시연용 모의 결제로, 실제 청구나 요금제 변경은 없어요.</p>
      {compare && <div id="settings-plan-compare" className="settings-plan-compare">
        {plans.isPending && <p className="meta" role="status">요금제 비교를 불러오는 중이에요.</p>}
        {plans.isError && <div role="alert">
          <p>요금제 비교를 불러오지 못했어요.</p>
          <button type="button" className="btn btn-line btn-sm" onClick={() => plans.refetch()}>다시 시도</button>
        </div>}
        {plans.data && <div className="table-wrap">
          <table>
            <caption className="sr-only">무료와 플러스 시연 요금제 비교</caption>
            <thead><tr><th scope="col">항목</th><th scope="col">무료</th><th scope="col">플러스</th></tr></thead>
            <tbody>
              <tr><th scope="row">이용 요금</th><td>0원</td><td>월 {won(plans.data.prices.MONTHLY.amount)}원 / 연 {won(plans.data.prices.YEARLY.amount)}원</td></tr>
              <tr><th scope="row">정책 마감 리마인더</th><td>—</td><td>등록 시연 · 실제 발송 없음</td></tr>
              {plans.data.compare.filter((row) => row.feature === '종목 / 비교 / 프리셋' || row.feature === '광고 없음').map((row) => (
                <tr key={row.feature}><th scope="row">{row.feature}</th><td>{row.free}</td><td>{row.plus}</td></tr>
              ))}
            </tbody>
          </table>
        </div>}
        <div className="settings-plan-more"><Link to="/plus">자세히 보기 →</Link></div>
      </div>}
    </section>
  );
}

/** 이메일 계정은 비밀번호, 소셜 계정은 확인 문구로 본인 확인을 한다(서버가 최종 판단). */
function AccountActions({ social, onSignOut, onDone }: { social: boolean; onSignOut: () => Promise<void>; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/me', { method: 'DELETE', json: social ? { confirm: value.trim() } : { password: value } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="settings-account-actions">
        <button type="button" className="btn btn-line" disabled={busy || signingOut}
          onClick={async () => {
            setSigningOut(true);
            try { await onSignOut(); } finally { setSigningOut(false); }
          }}>
          {signingOut ? '로그아웃 중…' : '로그아웃'}
        </button>
        <button type="button" className="btn btn-line" disabled={busy || signingOut}
          aria-expanded={open} aria-controls="withdraw-form" onClick={() => setOpen((value) => !value)}>
          서비스 탈퇴
        </button>
      </div>
      <p className="settings-withdraw-note">
        웹 계정과 웹에 저장한 앱 연동 정보를 지워요. 앱 계정은 탈퇴되지 않아요. 백업·기록의 삭제 시점은 <Link to="/privacy">개인정보처리방침</Link>에 있어요.
      </p>
      {open && (
        <form id="withdraw-form" className="col settings-withdraw-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="wd">{social ? `확인을 위해 '${WITHDRAW_CONFIRM}'를 입력해 주세요` : '비밀번호'}</label>
            <input
              className="input"
              id="wd"
              type={social ? 'text' : 'password'}
              autoComplete={social ? 'off' : 'current-password'}
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-line btn-sm" type="button" onClick={() => setOpen(false)} disabled={busy || signingOut}>
              그만두기
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy || signingOut || (social && value.trim() !== WITHDRAW_CONFIRM)}>
              {busy ? '처리하는 중…' : '탈퇴하기'}
            </button>
          </div>
          {error && (
            <p className="meta" role="alert" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
