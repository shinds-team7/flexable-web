// 이메일로 가입하기. 웹 계정은 앱 계정과 따로다(04 §4). 입력 규칙은 서버가 최종 검사한다(backend/README.md "API").
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '@/auth/session';
import type { AuthResponse } from '@/auth/types';
import { LEGAL_BASE } from '@/components/Layout';
import { privacyHref, usesWebBackend } from '@/lib/legal';
import { api, errorText } from '@/lib/api';

export default function Signup() {
  const { status, signIn } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  // 웹 백엔드는 가입 정보를 계약 이행으로 처리하고 방침은 안내만 한다(동의 체크 없음). 앱 서버를 부르는 배포는 앱 가입 규칙(개인정보 동의 필수)을 따른다.
  const [agreePrivacy, setAgreePrivacy] = useState(usesWebBackend);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'member') return <Navigate to="/home" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<AuthResponse>('/auth/signup', {
        method: 'POST',
        json: usesWebBackend ? { email: email.trim(), password, agreeTerms } : { email: email.trim(), password, agreeTerms, agreePrivacy },
      });
      signIn(r);
      navigate('/home', { replace: true });
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
          <h1 className="page-title" style={{ textAlign: 'center' }}>
            이메일로 가입하기
          </h1>
          <p className="sub" style={{ textAlign: 'center', fontSize: 14, marginBottom: 8 }}>
            웹 계정은 앱 계정과 따로 만들어요.
          </p>
          <form className="col" style={{ gap: 12 }} onSubmit={submit}>
            <div className="field">
              <label htmlFor="su-em">이메일</label>
              <input className="input" id="su-em" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="su-pw">비밀번호</label>
              <input
                className="input"
                id="su-pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={64}
                aria-describedby="su-pw-hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span id="su-pw-hint" className="meta">
                8자 이상, 영문과 숫자를 모두 넣어 주세요.
              </span>
            </div>
            <div className="checks">
              <label className="check">
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
                <span>
                  <a href={`${LEGAL_BASE}/terms`}>서비스 이용약관</a>에 동의해요(필수)
                </span>
              </label>
              {!usesWebBackend && (
                <label className="check">
                  <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
                  <span>
                    <a href={privacyHref}>개인정보 수집·이용</a>에 동의해요(필수)
                  </span>
                </label>
              )}
            </div>
            {usesWebBackend && (
              <p className="meta">
                이메일·비밀번호 등 계정에 필요한 정보는 회원가입과 서비스 제공을 위해 처리해요. 처리 항목·보유 기간·권리 행사 방법은{' '}
                <a href={privacyHref}>개인정보처리방침</a>에 있어요.
              </p>
            )}
            <button className="btn btn-primary btn-block" disabled={busy || !agreeTerms || !agreePrivacy}>
              {busy ? '가입하는 중…' : '가입하기'}
            </button>
            <Link to="/login?email=1" className="meta" style={{ textAlign: 'center' }}>
              이미 계정이 있어요
            </Link>
          </form>
          <p className="meta" style={{ textAlign: 'center' }}>
            만 14세 이상만 이용할 수 있어요.
          </p>
          {error && (
            <div className="error-box" style={{ padding: 16 }} role="alert">
              <h3>가입하지 못했어요</h3>
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
