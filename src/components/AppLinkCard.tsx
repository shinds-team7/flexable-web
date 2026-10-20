// 내 정보 > 앱 연동. 앱에서 받은 코드로 연동하고, 앱이 확정한 시드머니를 보여 주고, 해제한다(04 §5).
// 웹 계정과 앱 계정은 따로다. 이메일이 같아도 자동으로 잇지 않고 코드로만 연동한다.
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppLink, useLinkApp, useUnlinkApp, type AppLink, type SeedChoice } from '@/data/appLink';
import { ApiError, errorText } from '@/lib/api';
import { fmtMonthDay, fmtMonthDayTime, won } from '@/lib/format';

const PROVIDER: Record<string, string> = { email: '이메일', kakao: '카카오', google: 'Google' };
const CHOICE: Record<SeedChoice, string> = { GOAL: '매달 저축할 돈만큼', ALL: '남은 돈 전부', MANUAL: '직접 입력한 금액' };

/** 서버 오류를 화면 문구로. 시도 제한이면 기다릴 시간을 덧붙인다. */
function linkErrorText(e: unknown) {
  if (e instanceof ApiError && e.code === 'TOO_MANY_ATTEMPTS') {
    const sec = Number(e.details.retryAfterSeconds);
    return sec > 0 ? `코드를 여러 번 잘못 입력했어요. ${Math.ceil(sec / 60)}분 뒤에 다시 시도해 주세요` : e.message;
  }
  return errorText(e);
}

/** 로그인한 회원에게만 보인다. 웹 서버에 앱 서버 설정이 없으면(enabled=false) 연동 중이 아닌 한 카드를 숨긴다(없는 기능을 보여 주지 않음). */
export function AppLinkCard({ member }: { member: boolean }) {
  const q = useAppLink(member);
  const { hash } = useLocation();
  const hidden = !member || (q.data !== undefined && !q.data.enabled && !q.data.linked);

  // 홈 안내의 [앱 연동하기](/me#app-link)로 들어오면 카드로 옮기고 코드 입력칸에 커서를 둔다.
  useEffect(() => {
    if (hash !== '#app-link' || hidden || q.isPending) return;
    document.getElementById('app-link')?.scrollIntoView({ block: 'start' });
    document.getElementById('app-link-code')?.focus({ preventScroll: true });
  }, [hash, hidden, q.isPending]);

  if (hidden) return null;
  return (
    <div className="card" id="app-link">
      <h2>앱 연동</h2>
      {q.isPending ? (
        <div aria-busy="true" aria-label="불러오는 중" style={{ marginTop: 12 }}>
          <div className="skel" style={{ height: 16, width: 200 }} />
          <div className="skel" style={{ height: 44, marginTop: 12 }} />
        </div>
      ) : q.isError ? (
        <div className="set-row">
          <p className="v" role="alert">
            연동 상태를 불러오지 못했어요. {errorText(q.error)}
          </p>
          <button className="btn btn-line btn-sm" onClick={() => q.refetch()}>
            다시 불러오기
          </button>
        </div>
      ) : q.data.linked ? (
        <Linked link={q.data} refreshing={q.isFetching} onRefresh={() => q.refetch()} />
      ) : (
        <NotLinked appUnlinked={q.data.reason === 'app_unlinked'} onExists={() => q.refetch()} />
      )}
    </div>
  );
}

function NotLinked({ appUnlinked, onExists }: { appUnlinked: boolean; onExists: () => void }) {
  const [code, setCode] = useState('');
  const link = useLinkApp();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (link.isPending) return;
    link.mutate(code.trim(), {
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'APP_LINK_EXISTS') onExists();
      },
    });
  };

  return (
    <div className="col" style={{ gap: 12, marginTop: 8 }}>
      {appUnlinked && (
        <p className="meta" role="status" style={{ color: 'var(--warn)' }}>
          앱에서 연동을 해제했거나 앱 계정을 탈퇴해서 연동이 끝났어요. 웹에 저장했던 앱 정보도 지웠어요.
        </p>
      )}
      <p className="v">
        앱 <b>설정 › 웹 연동 코드 받기</b>에서 받은 8자리 코드를 입력해 주세요. 코드는 10분 동안 한 번만 쓸 수 있어요. 연동하면 앱의 로그인 방법·이메일과
        앱에서 확정한 시드머니만 불러오고, 거래 기록은 불러오지 않아요.
      </p>
      <form className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={submit}>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="app-link-code">연동 코드</label>
          <input
            className="input num"
            id="app-link-code"
            placeholder="K7M2-Q9XB"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <button className="btn btn-primary" disabled={link.isPending || code.trim() === ''}>
          {link.isPending ? '연동하는 중…' : '앱 연동하기'}
        </button>
      </form>
      {link.isError && (
        <p className="form-error" role="alert">
          {linkErrorText(link.error)}
        </p>
      )}
    </div>
  );
}

function Linked({ link, refreshing, onRefresh }: { link: Extract<AppLink, { linked: true }>; refreshing: boolean; onRefresh: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const unlink = useUnlinkApp();
  const { account, seedMoney: seed } = link;
  const stale = link.sync.status === 'stale';

  return (
    <div style={{ marginTop: 8 }}>
      {stale && (
        <div className="set-row">
          <p className="meta" role="status" style={{ color: 'var(--warn)' }}>
            지금은 앱 정보를 불러오지 못해 {fmtMonthDayTime(link.sync.syncedAt)} 기준 값을 보여 드려요. 연동은 그대로예요.
          </p>
          <button className="btn btn-line btn-sm" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? '불러오는 중…' : '다시 불러오기'}
          </button>
        </div>
      )}
      <div className="set-row">
        <span className="k">연동한 앱 계정</span>
        <span className="v">
          {PROVIDER[account.provider] ?? account.provider} · {account.email ?? '이메일 없음'}
        </span>
      </div>
      <div className="set-row">
        <span className="k">연동한 날</span>
        <span className="v">{fmtMonthDayTime(link.linkedAt)}</span>
      </div>
      <div className="set-row">
        <div>
          <p className="k">앱에서 모은 시드머니</p>
          {seed.status === 'available' && <p className="meta">앱에서 확정한 값 · {fmtMonthDayTime(seed.updatedAt)} 기준</p>}
        </div>
        {seed.status === 'available' ? (
          <span className="num" style={{ fontSize: 22, fontWeight: 800 }}>
            {won(seed.total)}원
          </span>
        ) : (
          <span className="v">{seed.status === 'budget_not_set' ? '앱에서 예산을 설정하면 보여요' : '아직 불러오지 못했어요'}</span>
        )}
      </div>
      {seed.status === 'available' && (
        <>
          <div className="set-row">
            <span className="k">처음 모아둔 돈</span>
            <span className="v num">{won(seed.base)}원</span>
          </div>
          <div className="set-row">
            <span className="k">매달 저축할 돈</span>
            <span className="v num">{won(seed.monthlyGoal)}원</span>
          </div>
          <div className="set-row">
            <span className="k">마지막 반영</span>
            <span className="v num">
              {seed.lastEntry
                ? `${fmtMonthDay(seed.lastEntry.cycleEnd)} 정산 · ${CHOICE[seed.lastEntry.choice] ?? seed.lastEntry.choice} · ${won(seed.lastEntry.amount)}원`
                : '아직 반영한 적 없어요'}
            </span>
          </div>
        </>
      )}
      <div className="set-row">
        <div>
          <p className="k">연동 해제</p>
          <p className="v">웹에 저장한 앱 정보를 지우고 연동을 끝내요. 앱 계정과 앱 기록은 그대로예요. 앱 로그아웃으로는 해제되지 않아요.</p>
        </div>
        {!confirming && (
          <button className="btn btn-line btn-sm" onClick={() => setConfirming(true)}>
            해제하기
          </button>
        )}
      </div>
      {confirming && (
        <div className="card-sunken col" role="alertdialog" aria-labelledby="unlink-title" style={{ gap: 12 }}>
          <p className="k" id="unlink-title">
            앱 연동을 해제할까요?
          </p>
          <p className="v">다시 연동하려면 앱에서 새 코드를 받아야 해요.</p>
          <div className="row" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-line btn-sm" onClick={() => setConfirming(false)} disabled={unlink.isPending}>
              그만두기
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
              {unlink.isPending ? '해제하는 중…' : '해제하기'}
            </button>
          </div>
          {unlink.isError && (
            <p className="form-error" role="alert">
              {errorText(unlink.error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
