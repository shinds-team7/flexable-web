// 내 정보: 계정·화면 설정(라이트/다크)·로그아웃·탈퇴. 앱 기록 상태·구독은 팀원이 채운다.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveSettings } from '@/auth/settings';
import { useSession } from '@/auth/session';
import { api, errorText } from '@/lib/api';
import { useTheme, type Theme } from '@/lib/theme';

const PROVIDER: Record<string, string> = { email: '이메일', kakao: '카카오', google: 'Google' };
const WITHDRAW_CONFIRM = '탈퇴';

export default function Me() {
  const { status, user, signOut, clearSession } = useSession();
  const guest = status === 'guest';
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const themes: { v: Theme; label: string }[] = [
    { v: 'light', label: '라이트' },
    { v: 'dark', label: '다크' },
  ];
  const pickTheme = (t: Theme) => {
    setTheme(t);
    if (status === 'member') void saveSettings({ theme: t });
  };
  return (
    <section>
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <h1 className="page-title">내 정보</h1>
        </div>
        <div className="col">
          <div className="card">
            <h2>계정</h2>
            <div className="set-row">
              <span className="k">로그인 방법</span>
              <span className="v">{guest ? '로그인 없이 체험 중' : user ? PROVIDER[user.provider] : '확인 중'}</span>
            </div>
            <div className="set-row">
              <span className="k">이메일</span>
              <span className="v">{guest ? '체험 내용은 계정에 저장되지 않아요' : user?.email ?? '이메일 없음'}</span>
            </div>
          </div>
          <div className="card">
            <h2>화면 설정</h2>
            <div className="set-row">
              <div>
                <p className="k">테마</p>
                <p className="v">{guest ? '기본은 라이트예요. 고른 테마는 이 브라우저에 저장돼요.' : '기본은 라이트예요. 고른 테마는 계정에 저장돼 다른 브라우저에서도 이어져요.'}</p>
              </div>
              <div className="seg" role="group" aria-label="테마">
                {themes.map((t) => (
                  <button key={t.v} aria-pressed={theme === t.v} disabled={status === 'loading'} onClick={() => pickTheme(t.v)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {guest ? (
            <div className="card">
              <p className="k">로그인 없이 체험 중</p>
              <p className="v">예시 데이터로 둘러보고 있어요. 내 계정으로 이용하려면 로그인해 주세요.</p>
              <Link className="btn btn-line btn-sm" to="/login">로그인</Link>
            </div>
          ) : status === 'member' && <div className="card">
            <div className="set-row">
              <div>
                <p className="k">로그아웃</p>
                <p className="v">이 계정으로 웹에 로그인한 모든 기기에서 로그아웃돼요. 앱 로그인에는 영향이 없어요.</p>
              </div>
              <button
                className="btn btn-line btn-sm"
                onClick={async () => {
                  await signOut();
                  navigate('/', { replace: true });
                }}
              >
                로그아웃
              </button>
            </div>
          </div>}
          {user && (
            <Withdraw
              social={user.provider !== 'email'}
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

/** 이메일 계정은 비밀번호, 소셜 계정은 확인 문구로 본인 확인을 한다(서버가 최종 판단). */
function Withdraw({ social, onDone }: { social: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      <div className="set-row">
        <div>
          <p className="k">웹 탈퇴</p>
          <p className="v">웹 계정과 웹에 저장한 정보를 지워요. 앱 계정과 앱 기록은 그대로예요.</p>
        </div>
        {!open && (
          <button className="btn btn-line btn-sm" onClick={() => setOpen(true)}>
            탈퇴하기
          </button>
        )}
      </div>
      {open && (
        <form className="col" style={{ gap: 12, marginTop: 12 }} onSubmit={submit}>
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
            <button className="btn btn-line btn-sm" type="button" onClick={() => setOpen(false)} disabled={busy}>
              그만두기
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy || (social && value.trim() !== WITHDRAW_CONFIRM)}>
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
