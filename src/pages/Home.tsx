// 홈(로그인 후). 왼쪽: 시드머니 히어로·쌓인 모양(꺾은선)·굴렸다면. 오른쪽 레일: 코스피·코스닥 → 오늘의 청년 금융 소식.
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { loadSettings, saveSettings } from '@/auth/settings';
import { SeedLineChart } from '@/charts/SeedLineChart';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CountUp } from '@/components/CountUp';
import { DDay } from '@/components/Icons';
import { RollingNumber } from '@/components/RollingNumber';
import { useAppLink } from '@/data/appLink';
import { fmtMonth, useGoal } from '@/data/goal';
import { useHomeNews, useIndices, useSeedMoney, useSetSeedManual, type MarketIndices, type SeedMoney } from '@/data/home';
import { errorText } from '@/lib/api';
import { fmtMonthDay, upDown, won } from '@/lib/format';

/** 서버 SeedMoneyDtos.MAX_MANUAL_TOTAL과 같다(10억 원) */
const MAX_MANUAL = 1_000_000_000;

const RANGES = [
  { r: 6, label: '6개월' },
  { r: 12, label: '1년' },
  { r: 99, label: '전체' },
];

function SeedHero({ seed }: { seed: SeedMoney }) {
  const [editing, setEditing] = useState(false);
  // 저장·되돌리기: 로그인 회원은 PUT·DELETE /api/v1/me/seed-money/manual(확정 15), 비로그인 체험은 이 탭에서만.
  const setManual = useSetSeedManual();
  const [busy, setBusy] = useState(false);
  const manual = seed.manual;
  const [draft, setDraft] = useState(String(seed.manual ?? seed.confirmed));
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState('');
  const amount = manual ?? seed.confirmed;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const change = (v: string) => {
    const raw = v.replace(/,/g, '').trim();
    if (/[^\d]/.test(raw)) {
      setError('숫자만 입력해 주세요.');
      return;
    }
    setError('');
    setDraft(raw === '' ? '' : String(Number(raw)));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (draft === '') {
      setError('금액을 입력해 주세요.');
      return;
    }
    const n = Math.floor(Number(draft));
    if (n > MAX_MANUAL) {
      setError(`${won(MAX_MANUAL)}원까지 넣을 수 있어요.`);
      return;
    }
    setBusy(true);
    try {
      const { saved } = await setManual(n);
      setEditing(false);
      setToast(saved ? `저장했어요. 시드머니가 ${won(n)}원으로 바뀌었어요.` : `시드머니를 ${won(n)}원으로 바꿨어요. 체험 중이라 저장되지 않아요.`);
    } catch (err) {
      setError(errorText(err, '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await setManual(null);
      setDraft(String(seed.confirmed));
      setEditing(false);
      setToast(`앱 기록 기준 금액 ${won(seed.confirmed)}원으로 돌아갔어요.`);
    } catch (err) {
      setToast(errorText(err, '되돌리지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  return (
    <div className="card card-hero home-hero">
      <p className="hero-label">
        내 시드머니 {seed.isSample && <span className="tag-ex">예시</span>}
        {manual != null && <span className="tag">직접 입력</span>}
      </p>
      <p className="hero-num num">
        <RollingNumber value={amount} />
        <small>원</small>
      </p>
      {seed.current != null && (
        <p className="sub">
          이번 주기 남기는 중 <b className="num">{won(seed.current)}원</b> · 확정 전
        </p>
      )}
      {editing ? (
        <form className="seed-edit" onSubmit={save} noValidate>
          <div className="field">
            <label htmlFor="seedAmount">시드머니</label>
            <div className="input-affix">
              <input
                id="seedAmount"
                className="input num"
                inputMode="numeric"
                autoComplete="off"
                value={draft === '' ? '' : won(Number(draft))}
                onChange={(e) => change(e.target.value)}
                aria-invalid={!!error}
                aria-describedby="seedAmountHelp"
                autoFocus
              />
              <span className="unit">원</span>
            </div>
            <p id="seedAmountHelp" className={error ? 'form-error' : 'meta'}>
              {error || '앱 기록 대신 이 금액을 상단 칩·투자 시뮬레이션에서도 써요.'}
            </p>
          </div>
          <div className="seed-edit-acts">
            <button type="button" className="btn btn-line btn-sm" onClick={() => (setEditing(false), setError(''))}>
              취소
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      ) : (
        <div className="hero-acts">
          <Link className="btn btn-primary btn-sm" to="/simulation">
            투자 시뮬레이션 해 보기
          </Link>
          <button type="button" className="btn btn-line btn-sm" onClick={() => setEditing(true)}>
            수정하기
          </button>
          {manual != null && (
            <button type="button" className="btn btn-text" onClick={() => setConfirmReset(true)}>
              기록 기준으로 되돌리기
            </button>
          )}
        </div>
      )}
      <div className="hero-foot">
        {seed.todaySaved != null && <span className="meta">오늘 아낀 돈 {won(seed.todaySaved)}원</span>}
        {seed.asOf ? (
          <>
            <span className="meta">매달 저축할 돈 {won(seed.avgPerCycle)}원</span>
            <span className="meta">
              앱에서 확정한 값 · {fmtMonthDay(seed.asOf)}
              {seed.stale && ' · 지금은 앱 정보를 불러오지 못해 마지막으로 받은 값이에요'}
            </span>
          </>
        ) : (
          <span className="meta">앱을 연동하면 앱에서 모은 시드머니를 불러와요. 수정하기로 직접 넣을 수도 있어요.</span>
        )}
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="직접 입력한 금액을 지울까요?"
        confirmLabel="지우기"
        danger
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      >
        <p>지우면 앱에 입력한 기록 기준 금액으로 돌아가요. 지운 금액은 다시 불러올 수 없어요.</p>
        <div className="dlg-money">
          <span>돌아갈 금액</span>
          <b className="num">{won(seed.confirmed)}원</b>
        </div>
      </ConfirmDialog>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function SeedHistory({ seed }: { seed: SeedMoney }) {
  const [range, setRange] = useState(99);
  const data = seed.history.slice(-Math.min(range, seed.history.length));
  const first = data[0]?.date.split('-').map(Number);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>시드머니가 쌓인 모양</h2>
          {first && (
            <p className="meta">
              {first[0]}년 {first[1]}월부터 · 정산 주기마다 쌓인 돈{seed.isSample && ' · 예시'}
            </p>
          )}
        </div>
        {seed.history.length > 0 && (
          <div className="seg" role="group" aria-label="기간">
            {RANGES.map((o) => (
              <button key={o.r} aria-pressed={range === o.r} onClick={() => setRange(o.r)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {seed.history.length > 0 ? (
        <SeedLineChart data={data} />
      ) : (
        <p className="sub">앱에서 수입일 전날 시드머니를 반영하면 주기마다 쌓인 모양이 여기에 그려져요.</p>
      )}
    </div>
  );
}

function WhatIf({ seed }: { seed: SeedMoney }) {
  // TODO(BE): 서버 계산 결과로 바꾼다(클라이언트 재계산 금지, ADR-3). 아래는 예시 값.
  const base = seed.manual ?? seed.confirmed;
  const rows = [
    { to: '/simulation', lbl: '예시 대표지수 ETF', val: Math.floor(base * 1.098), dl: '▲ 9.8%', more: '투자 시뮬레이션 열기' },
    { to: '/savings', lbl: '은행 평균 적금(한국은행)', val: Math.floor(base * 1.032), dl: '▲ 3.2%', more: '적금 모아보기 열기' },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>이 돈을 굴렸다면?</h2>
          <p className="meta">1년 전 오늘, {won(base)}원을 한 번에 넣었다고 같은 조건으로 계산했어요 · 예시 수익률</p>
        </div>
      </div>
      <div className="stats">
        {rows.map((r) => (
          <Link key={r.to} className="stat" to={r.to} style={{ color: 'inherit' }}>
            <span className="lbl">{r.lbl}</span>
            <p className="val num">
              <CountUp value={r.val} format={(n) => `${won(n)}원`} />
            </p>
            <span className={'dl ' + (r.val > base ? 'up' : 'flat')}>{r.dl}</span>
            <p className="meta">{r.more}</p>
          </Link>
        ))}
      </div>
      <p className="meta" style={{ marginTop: 12 }}>
        과거 기준 계산이에요. 앞으로도 그렇다는 뜻은 아니에요.
      </p>
    </div>
  );
}

function MarketCard({ m }: { m: MarketIndices | undefined }) {
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h2>오늘의 시장</h2>
        {m?.isSample && <span className="tag-ex">예시</span>}
      </div>
      {!m ? (
        <div className="market">
          <div className="skel" style={{ height: 76 }} />
          <div className="skel" style={{ height: 76 }} />
        </div>
      ) : (
        <>
          <div className="market">
            {m.items.map((i) => {
              const ud = upDown(i.change);
              return (
                <div key={i.code} className="idx">
                  <p className="nm">{i.name}</p>
                  <p className="val num">
                    <CountUp value={i.value} decimals={2} format={(n) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                  </p>
                  <p className={'chg num ' + ud}>
                    {ud === 'up' ? '▲' : ud === 'down' ? '▼' : ''} {Math.abs(i.change).toFixed(2)} ({(Math.abs(i.changeRate) * 100).toFixed(2)}%)
                  </p>
                </div>
              );
            })}
          </div>
          <p className="meta" style={{ marginTop: 10 }}>
            {fmtMonthDay(m.asOf)} 종가 기준 · 출처 {m.source}
          </p>
        </>
      )}
    </div>
  );
}

function HomeNews() {
  const { data } = useHomeNews();
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <h2>오늘의 청년 금융 소식</h2>
        <Link to="/news" style={{ fontSize: 14, fontWeight: 600 }}>
          전체 보기
        </Link>
      </div>
      <div className="col" style={{ gap: 12 }}>
        {(data ?? []).map((n) => (
          <Link key={n.id} to={`/news/${n.id}`} className="card-sunken" style={{ display: 'block', color: 'inherit' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <DDay d={n.dday} />
              <span className="tag">{n.cat}</span>
            </div>
            <p style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.45 }}>{n.title}</p>
            <p className="meta">{n.save}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** 로그인한 회원에게만 웹 목표 요약을 보여 준다(goal-ai.md §6). 숫자는 서버 값 그대로 */
function GoalMini() {
  const { status } = useSession();
  const q = useGoal(status === 'member');
  if (status !== 'member' || !q.data) return null;
  const g = q.data.goal;
  if (!g) {
    return (
      <div className="card">
        <h2>목표</h2>
        <p className="sub" style={{ marginTop: 4 }}>
          목표 금액과 기한을 정하면 매달 얼마씩 남기면 되는지 알려 드려요.
        </p>
        <Link className="btn btn-line btn-sm" to="/goal" style={{ marginTop: 12 }}>
          목표 세우기
        </Link>
      </div>
    );
  }
  const p = g.progress;
  return (
    <Link className="card goal-mini" to="/goal" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      <div className="card-head" style={{ marginBottom: 4 }}>
        <h2>{g.name}</h2>
        <span className="meta">{fmtMonth(g.dueMonth)}까지</span>
      </div>
      <p className="num" style={{ fontWeight: 700 }}>
        <CountUp value={p.current} format={(n) => `${won(n)}원`} /> <span className="meta">/ {won(g.amount)}원</span>
      </p>
      <div className="goal-track" aria-hidden="true">
        <span style={{ width: `${p.ratioBp / 100}%` }} />
      </div>
      <p className="meta" style={{ marginTop: 8 }}>
        {p.status === 'REACHED'
          ? '목표에 닿았어요'
          : p.status === 'OVERDUE'
            ? '기한이 지났어요 · 기한을 새로 정해 보세요'
            : `매달 ${won(p.requiredMonthly ?? 0)}원 남기면 돼요`}
      </p>
    </Link>
  );
}

const APP_LINK_INTRO = 'app-link-intro';

/**
 * 가입 직후 등 아직 앱과 연동하지 않은 회원에게 [앱 연동하기]를 한 번 권한다(04 §5-1). 가입 단계로 강제하지 않고,
 * [다음에 할게요]를 누르면 본 안내(seenTours)로 저장해 다시 띄우지 않는다. 웹 서버에 앱 연동 설정이 없으면 보이지 않는다.
 */
function AppLinkIntro() {
  const { status } = useSession();
  const member = status === 'member';
  const link = useAppLink(member);
  const settings = useQuery({ queryKey: ['me', 'settings'], queryFn: loadSettings, enabled: member, staleTime: Infinity });
  const [dismissed, setDismissed] = useState(false);
  if (!member || dismissed || !link.data?.enabled || link.data.linked || !settings.data) return null;
  if (settings.data.seenTours.includes(APP_LINK_INTRO)) return null;

  const dismiss = () => {
    setDismissed(true);
    void saveSettings({ seenTours: [APP_LINK_INTRO] });
  };
  return (
    <div className="card" role="region" aria-label="앱 연동 안내">
      <h2>앱에서 모은 시드머니를 불러올까요?</h2>
      <p className="sub" style={{ marginTop: 4 }}>
        텅장관리 앱 설정에서 받은 연동 코드를 입력하면 앱에서 확정한 시드머니를 웹에서 볼 수 있어요. 웹만 써도 괜찮아요.
      </p>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <Link className="btn btn-primary btn-sm" to="/me#app-link">
          앱 연동하기
        </Link>
        <button className="btn btn-line btn-sm" onClick={dismiss}>
          다음에 할게요
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const seed = useSeedMoney();
  const indices = useIndices();
  return (
    <section>
      <div className="page">
        <div className="g84">
          <div className="col stagger">
            <AppLinkIntro />
            {seed.isPending ? (
              <>
                <div className="card card-hero" aria-busy="true" aria-label="불러오는 중">
                  <div className="skel" style={{ height: 18, width: 120 }} />
                  <div className="skel" style={{ height: 52, width: 320, marginTop: 12 }} />
                  <div className="skel" style={{ height: 14, width: 240, marginTop: 12 }} />
                </div>
                <div className="card">
                  <div className="skel" style={{ height: 18, width: 160 }} />
                  <div className="skel" style={{ height: 220, marginTop: 16 }} />
                </div>
              </>
            ) : seed.isError ? (
              <div className="error-box" role="alert">
                <h3>앱 기록을 불러오지 못했어요</h3>
                <p className="sub">굴려보기는 금액을 직접 넣어서 할 수 있어요.</p>
                <div className="toolbar">
                  <button className="btn btn-primary" onClick={() => seed.refetch()}>
                    다시 불러오기
                  </button>
                  <Link className="btn btn-line" to="/simulation">
                    직접 금액으로
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <SeedHero seed={seed.data} />
                <SeedHistory seed={seed.data} />
                <WhatIf seed={seed.data} />
              </>
            )}
          </div>
          <aside className="col rail stagger" aria-label="목표와 오늘의 시장·소식">
            <GoalMini />
            <MarketCard m={indices.data} />
            <HomeNews />
          </aside>
        </div>
      </div>
    </section>
  );
}
