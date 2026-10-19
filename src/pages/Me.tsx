// 내 정보: 계정·화면 설정(라이트/다크)·로그아웃. 앱 기록 상태·구독은 팀원이 채운다.
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { useTheme, type Theme } from '@/lib/theme';

const PROVIDER: Record<string, string> = { email: '이메일', kakao: '카카오', google: 'Google' };

export default function Me() {
  const { user, signOut } = useSession();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const themes: { v: Theme; label: string }[] = [
    { v: 'light', label: '라이트' },
    { v: 'dark', label: '다크' },
  ];
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
              <span className="v">{user ? PROVIDER[user.provider] : '-'}</span>
            </div>
            <div className="set-row">
              <span className="k">이메일</span>
              <span className="v">{user?.email ?? '이메일 없음'}</span>
            </div>
          </div>
          <div className="card">
            <h2>화면 설정</h2>
            <div className="set-row">
              <div>
                <p className="k">테마</p>
                <p className="v">기본은 라이트예요. 고른 테마는 이 브라우저에 저장돼요.</p>
              </div>
              <div className="seg" role="group" aria-label="테마">
                {themes.map((t) => (
                  <button key={t.v} aria-pressed={theme === t.v} onClick={() => setTheme(t.v)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="set-row">
              <div>
                <p className="k">로그아웃</p>
                <p className="v">앱을 포함해 이 계정으로 로그인한 모든 기기에서 로그아웃돼요.</p>
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
          </div>
        </div>
      </div>
    </section>
  );
}
