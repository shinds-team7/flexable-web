// /oauth/callback?code= | ?error= — 서버가 준 1회용 코드를 verifier와 교환한다(확정 14).
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { exchangeCode, OAUTH_MESSAGES } from '@/auth/oauth';
import { useSession } from '@/auth/session';
import { errorText } from '@/lib/api';

export default function OAuthCallback() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return; // 개발 모드 StrictMode의 두 번 실행에도 코드는 한 번만 교환
    done.current = true;
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    const fail = (msg: string) => {
      navigate(`/login?error=${encodeURIComponent(msg)}`, { replace: true });
    };
    if (!code) {
      fail(OAUTH_MESSAGES[q.get('error') ?? 'failed'] ?? OAUTH_MESSAGES.failed);
      return;
    }
    exchangeCode(code)
      .then((r) => {
        signIn(r);
        navigate('/home', { replace: true });
      })
      .catch((e) => fail(errorText(e, OAUTH_MESSAGES.failed)));
  }, [navigate, signIn]);

  return (
    <div className="page" aria-busy="true">
      <p className="sub" style={{ textAlign: 'center' }}>
        로그인하는 중이에요…
      </p>
    </div>
  );
}
