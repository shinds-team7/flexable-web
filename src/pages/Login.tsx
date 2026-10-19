// 로그인(와이어프레임 그대로, 실제 API 연결). 문구·버튼 규격은 앱과 같다(확정 10).
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchProviders, startOAuth, type OAuthProvider } from '@/auth/oauth';
import { useSession } from '@/auth/session';
import type { AuthResponse } from '@/auth/types';
import { Icon } from '@/components/Icons';
import { LEGAL_BASE } from '@/components/Layout';
import { api, errorText } from '@/lib/api';

const LABEL: Record<OAuthProvider, string> = { kakao: '카카오 로그인', google: 'Google 계정으로 로그인' };

/** 카카오·Google·이메일 세 버튼. 랜딩과 로그인 화면이 함께 쓴다. */
export function SocialButtons({ onError, onEmail }: { onError?: (msg: string) => void; onEmail?: () => void }) {
  const navigate = useNavigate();
  const providers = useQuery({ queryKey: ['oauth', 'providers'], queryFn: fetchProviders, staleTime: 10 * 60_000 });
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const fail = onError ?? ((m: string) => navigate(`/login?error=${encodeURIComponent(m)}`));
  const go = async (p: OAuthProvider) => {
    if (providers.data && !providers.data.includes(p)) return fail('지금은 이 로그인 방법을 쓸 수 없어요');
    setBusy(p);
    try {
      await startOAuth(p);
    } catch (e) {
      setBusy(null);
      fail(errorText(e));
    }
  };
  return (
    <>
      <button type="button" className="social kakao" onClick={() => go('kakao')} disabled={busy !== null}>
        <span className="logo-slot">
          <Icon id="i-kakao" size={18} />
        </span>
        {LABEL.kakao}
      </button>
      <button type="button" className="social google" onClick={() => go('google')} disabled={busy !== null}>
        <span className="logo-slot g-ph" aria-hidden="true">
          G
        </span>
        {LABEL.google}
      </button>
      {onEmail ? null : (
        <button type="button" className="social" style={{ background: 'var(--sunken)', border: 0 }} onClick={() => navigate('/login?email=1')}>
          이메일로 로그인
        </button>
      )}
    </>
  );
}

export default function Login() {
  const { status, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [emailOpen, setEmailOpen] = useState(params.get('email') === '1');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(params.get('error'));
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/home';

  if (status === 'member') return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<AuthResponse>('/auth/login', { method: 'POST', json: { email: email.trim(), password } });
      signIn(r);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="page">
        <div className="login-card">
          <div className="cat-ph" style={{ margin: '0 auto 16px', width: 96, height: 96, background: 'none', border: 0 }}>
            <img src="/characters/lv3-3.png" alt="" width={96} height={96} style={{ objectFit: 'contain' }} />
          </div>
          <h1 className="page-title" style={{ textAlign: 'center' }}>
            로그인
          </h1>
          <p className="sub" style={{ textAlign: 'center', fontSize: 14, marginBottom: 8 }}>
            앱과 같은 계정으로 로그인하면
            <br />
            앱에서 모은 돈을 그대로 불러와요.
          </p>
          <SocialButtons onError={setError} onEmail={() => setEmailOpen(true)} />
          <div className="divider">또는</div>
          <button
            className="btn"
            aria-expanded={emailOpen}
            aria-controls="emailForm"
            style={{ width: '100%', height: 48, borderRadius: 12, background: 'var(--sunken)' }}
            onClick={() => setEmailOpen((v) => !v)}
          >
            이메일로 로그인
          </button>
          {emailOpen && (
            <form id="emailForm" className="col" style={{ gap: 12 }} onSubmit={submit}>
              <div className="field">
                <label htmlFor="em">이메일</label>
                <input className="input" id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pw">비밀번호</label>
                <input className="input" id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? '로그인 중…' : '로그인'}
              </button>
              <Link to="/signup" className="meta" style={{ textAlign: 'center' }}>
                이메일로 가입하기
              </Link>
            </form>
          )}
          <p className="meta" style={{ textAlign: 'center' }}>
            로그인하면 <a href={`${LEGAL_BASE}/terms`}>이용약관</a>과 <a href={`${LEGAL_BASE}/privacy`}>개인정보처리방침</a>에 동의하는 것으로 봐요.
          </p>
          {error && (
            <div className="error-box" style={{ padding: 16 }} role="alert">
              <h3>로그인하지 못했어요</h3>
              <p className="sub" style={{ fontSize: 14 }}>
                {error}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
