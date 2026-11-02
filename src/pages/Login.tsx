// 로그인(와이어프레임 그대로, 실제 API 연결). 문구·버튼 규격은 앱과 같다(확정 10).
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchProviders, startOAuth, type OAuthProvider } from '@/auth/oauth';
import { useSession } from '@/auth/session';
import type { AuthResponse } from '@/auth/types';
import { Icon, Logo } from '@/components/Icons';
import { LEGAL_BASE, privacyHref, usesWebBackend } from '@/lib/legal';
import { api, errorText } from '@/lib/api';

const LABEL: Record<OAuthProvider, string> = { kakao: '카카오 로그인', google: 'Google 계정으로 로그인' };

/** 카카오·Google 간편 로그인 버튼 두 개. 버튼 이름은 aria-label로 읽힌다. */
export function SocialButtons({ onError }: { onError?: (msg: string) => void }) {
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
    <div className="login-sns">
      <button type="button" className="login-sns-btn kakao" aria-label={LABEL.kakao} title={LABEL.kakao} onClick={() => go('kakao')} disabled={busy !== null}>
        <Icon id="i-kakao" size={22} />
        <span>카카오</span>
      </button>
      <button type="button" className="login-sns-btn google" aria-label={LABEL.google} title={LABEL.google} onClick={() => go('google')} disabled={busy !== null}>
        <span className="g-mark" aria-hidden="true">
          G
        </span>
        <span>Google</span>
      </button>
    </div>
  );
}

/** 로그인 카드. /login 화면과 헤더 로그인 모달이 함께 쓴다. */
export function LoginPanel({ from, initialError = null, onSignedIn }: { from: string; initialError?: string | null; onSignedIn?: () => void }) {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  // [앱 연동하기]를 누르면 이메일 로그인 뒤 내 정보의 앱 연동 칸으로 보낸다(연동은 웹 계정으로 로그인한 뒤 앱 코드로 한다)
  const [linkAfter, setLinkAfter] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<AuthResponse>('/auth/login', { method: 'POST', json: { email: email.trim(), password } });
      signIn(r);
      onSignedIn?.();
      navigate(linkAfter ? '/me#app-link' : from, { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-card">
      <h1 className="login-brand">
        <Logo />
        <span className="logo-word">solpa</span>
        <span className="sr-only">로그인</span>
      </h1>
      <form className="login-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="em">
          이메일
        </label>
        <input className="input login-input" id="em" type="email" autoComplete="email" placeholder="이메일을 입력해 주세요." required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="sr-only" htmlFor="pw">
          비밀번호
        </label>
        <input className="input login-input" id="pw" type="password" autoComplete="current-password" placeholder="비밀번호를 입력해 주세요." required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="login-submit" disabled={busy}>
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>

      <div className="login-or">SNS 간편 로그인</div>
      <SocialButtons onError={setError} />
      <button type="button" className="login-applink" aria-pressed={linkAfter} onClick={() => setLinkAfter((v) => !v)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.5 18h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        앱 연동하기
      </button>
      {linkAfter && (
        <p className="login-applink-note" role="status">
          이메일로 로그인하면 내 정보의 앱 연동으로 바로 이동해요. 앱에서 받은 연동 코드를 넣으면 앱의 시드머니를 불러와요. 웹과 앱은 계정이 따로예요.
        </p>
      )}

      {error && (
        <div className="error-box" style={{ padding: 16 }} role="alert">
          <h3>로그인하지 못했어요</h3>
          <p className="sub" style={{ fontSize: 14 }}>
            {error}
          </p>
        </div>
      )}

      <p className="login-join">
        아직 solpa 회원이 아니신가요?<Link to="/signup">회원가입</Link>
      </p>
      <p className="login-legal">
        {usesWebBackend ? (
          <>
            처음 로그인하면 <a href={`${LEGAL_BASE}/terms`}>이용약관</a>에 동의하는 것으로 보고 계정이 만들어져요. 개인정보는 <a href={privacyHref}>개인정보처리방침</a>에 따라 처리해요.
          </>
        ) : (
          <>
            로그인하면 <a href={`${LEGAL_BASE}/terms`}>이용약관</a>과 <a href={privacyHref}>개인정보처리방침</a>에 동의하는 것으로 봐요.
          </>
        )}
      </p>
    </div>
  );
}

export default function Login() {
  const { status } = useSession();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const from = (location.state as { from?: string } | null)?.from ?? '/home';
  if (status === 'member') return <Navigate to={from} replace />;
  return (
    <section>
      <div className="page">
        <LoginPanel from={from} initialError={params.get('error')} />
      </div>
    </section>
  );
}
