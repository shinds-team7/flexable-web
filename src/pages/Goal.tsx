// AI 목표 달성(F7, docs/product/goal-ai.md §6). 숫자는 모두 서버 계산값이고, AI 안내 문장도 서버가 검사·치환한 결과를 그대로 보여 준다.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppLink } from '@/data/appLink';
import {
  CATEGORIES,
  categoryLabel,
  fmtMonth,
  monthFromNow,
  useDeleteGoal,
  useGoal,
  useMakeCoach,
  useSaveGoal,
  type Coach,
  type Goal,
  type GoalAi,
  type GoalCategory,
  type GoalInput,
  type GoalStatus,
  type ScenarioKey,
} from '@/data/goal';
import { ApiError, errorText } from '@/lib/api';
import { fmtMonthDayTime, won } from '@/lib/format';

const STATUS: Record<GoalStatus, { label: string; cls: string }> = {
  REACHED: { label: '목표에 닿았어요', cls: 'ok' },
  ON_TRACK: { label: '기한 안에 닿아요', cls: 'ok' },
  BEHIND: { label: '조금 더 필요해요', cls: 'warn' },
  NO_PACE: { label: '저축 속도를 넣어 주세요', cls: 'muted' },
  OVERDUE: { label: '기한이 지났어요', cls: 'warn' },
};

const SCENARIO: Record<ScenarioKey, string> = {
  KEEP_PACE: '지금 속도 그대로',
  MEET_DUE: '기한에 맞추려면',
  EXTEND_6: '기한을 6개월 늘리면',
};

const FALLBACK: Record<string, string> = {
  AI_UNAVAILABLE: 'AI 안내를 준비 중이라 기본 안내를 보여 드려요.',
  DAILY_CAP: '오늘 AI 안내 요청이 많아 기본 안내를 보여 드려요.',
  AI_FAILED: 'AI 안내를 만들지 못해 기본 안내를 보여 드려요.',
  AI_REJECTED: 'AI 안내가 기준에 맞지 않아 기본 안내를 보여 드려요.',
};

export default function GoalPage() {
  const { status } = useSession();
  const member = status === 'member';
  const q = useGoal(member);
  const [editing, setEditing] = useState(false);

  let body;
  if (status === 'loading' || (member && q.isPending)) body = <GoalSkeleton />;
  else if (!member) body = <GuestIntro />;
  else if (q.isError)
    body = (
      <div className="error-box" role="alert">
        <h3>목표를 불러오지 못했어요</h3>
        <p className="sub">{errorText(q.error)}</p>
        <button className="btn btn-primary" onClick={() => q.refetch()}>
          다시 불러오기
        </button>
      </div>
    );
  else if (!q.data) body = <GoalSkeleton />;
  else if (!q.data.goal || editing)
    body = <GoalForm goal={q.data.goal} onDone={() => setEditing(false)} onCancel={q.data.goal ? () => setEditing(false) : undefined} />;
  else body = <GoalView goal={q.data.goal} ai={q.data.ai} onEdit={() => setEditing(true)} />;

  return (
    <section>
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">AI 목표 달성</h1>
            <p className="page-desc">모은 돈으로 언제 목표에 닿는지 계산하고, AI가 내 숫자에 맞춘 실천 방법을 알려 줘요.</p>
          </div>
          <Link className="btn btn-secondary btn-sm" to="/goal/demo">새 목표 시나리오 체험 <span className="tag-ex">예시</span></Link>
        </div>
        {body}
      </div>
    </section>
  );
}

function GoalSkeleton() {
  return (
    <div className="g84" aria-busy="true" aria-label="불러오는 중">
      <div className="col">
        <div className="card">
          <div className="skel" style={{ height: 18, width: 140 }} />
          <div className="skel" style={{ height: 44, width: 280, marginTop: 12 }} />
          <div className="skel" style={{ height: 12, marginTop: 20 }} />
        </div>
        <div className="card">
          <div className="skel" style={{ height: 120 }} />
        </div>
      </div>
      <div className="card">
        <div className="skel" style={{ height: 200 }} />
      </div>
    </div>
  );
}

function GuestIntro() {
  return (
    <div className="empty-box goal-intro">
      <h3>목표를 하나 정해 보세요</h3>
      <p className="sub">
        목표 금액과 기한을 넣으면 매달 얼마씩 남기면 되는지, 지금 속도로는 언제 닿는지 계산해 드려요. 앱을 연동하면 앱에서 모은 시드머니로 바로 계산해요.
      </p>
      <ul className="goal-intro-list">
        <li>진행률·남은 금액·매달 필요한 금액</li>
        <li>지금 속도 유지 / 기한 맞추기 / 기한 늘리기 비교</li>
        <li>AI가 내 숫자로 쓴 실천 단계 3가지(하루 3회 무료)</li>
      </ul>
      <Link className="btn btn-primary" to="/login" state={{ from: '/goal' }}>
        로그인하고 목표 세우기
      </Link>
    </div>
  );
}

/* ───────── 입력 ───────── */

type Errors = Partial<Record<keyof GoalInput, string>>;
const digits = (s: string) => s.replace(/[^0-9]/g, '');
const toNum = (s: string) => (digits(s) === '' ? null : Number(digits(s)));
const grouped = (s: string) => (digits(s) === '' ? '' : Number(digits(s)).toLocaleString('ko-KR'));

function validate(v: { name: string; amount: number | null; dueMonth: string; currentAmount: number | null; monthlyPace: number | null }): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  if (name.length < 1 || name.length > 20) e.name = '목표 이름은 1~20자로 적어 주세요';
  if (v.amount == null) e.amount = '목표 금액을 넣어 주세요';
  else if (v.amount < 10_000 || v.amount > 1_000_000_000) e.amount = '1만 원부터 10억 원까지 넣을 수 있어요';
  if (!/^\d{4}-\d{2}$/.test(v.dueMonth)) e.dueMonth = '기한을 골라 주세요';
  else if (v.dueMonth < monthFromNow(1) || v.dueMonth > monthFromNow(120)) e.dueMonth = '다음 달부터 10년 안으로 골라 주세요';
  if (v.currentAmount != null && v.currentAmount > 1_000_000_000) e.currentAmount = '10억 원까지 넣을 수 있어요';
  if (v.monthlyPace != null && v.monthlyPace > 100_000_000) e.monthlyPace = '1억 원까지 넣을 수 있어요';
  return e;
}

function GoalForm({ goal, onDone, onCancel }: { goal: Goal | null; onDone: () => void; onCancel?: () => void }) {
  const { status } = useSession();
  const link = useAppLink(status === 'member');
  const appSeed = link.data?.linked && link.data.seedMoney.status === 'available' ? link.data.seedMoney : null;
  const save = useSaveGoal();

  const [category, setCategory] = useState<GoalCategory>(goal?.category ?? 'EMERGENCY');
  const [name, setName] = useState(goal?.name ?? categoryLabel(goal?.category ?? 'EMERGENCY'));
  const [nameTouched, setNameTouched] = useState(!!goal);
  const [amount, setAmount] = useState(goal ? won(goal.amount) : '');
  const [dueMonth, setDueMonth] = useState(goal?.dueMonth ?? monthFromNow(12));
  const [current, setCurrent] = useState(goal?.currentAmount != null ? won(goal.currentAmount) : '');
  const [pace, setPace] = useState(goal?.monthlyPace != null ? won(goal.monthlyPace) : '');
  const [errors, setErrors] = useState<Errors>({});

  const pick = (c: GoalCategory) => {
    setCategory(c);
    if (!nameTouched) setName(categoryLabel(c));
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const input: GoalInput = {
      category,
      name: name.trim(),
      amount: toNum(amount) ?? 0,
      dueMonth,
      currentAmount: toNum(current),
      monthlyPace: toNum(pace),
    };
    const e = validate({ ...input, amount: toNum(amount) });
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(input, {
      onSuccess: onDone,
      onError: (err) => {
        // 400 VALIDATION_FAILED는 { fields: { 칸: 메시지 } }로 문제 칸을 짚는다
        const fields = err instanceof ApiError ? (err.details.fields as Errors | undefined) : undefined;
        if (fields && Object.keys(fields).length) setErrors(fields);
      },
    });
  };

  // 서버가 짚은 칸이 없을 때만 폼 아래에 오류를 보여 준다(입력은 그대로 둔다)
  const fieldErr = save.error instanceof ApiError && !!save.error.details.fields;
  const err = (k: keyof GoalInput) =>
    errors[k] ? (
      <p id={`goal-${k}-err`} className="form-error">
        {errors[k]}
      </p>
    ) : null;

  return (
    <form className="card goal-form" onSubmit={submit} noValidate>
      <h2>{goal ? '목표 바꾸기' : '목표 세우기'}</h2>
      <p className="meta">무료로 목표 1개를 둘 수 있어요.</p>

      <div className="field">
        <span className="field-label" id="goal-cat-label">
          어떤 목표인가요?
        </span>
        <div className="chips" role="group" aria-labelledby="goal-cat-label">
          {CATEGORIES.map((c) => (
            <button key={c.v} type="button" className="chip" aria-pressed={category === c.v} onClick={() => pick(c.v)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="goal-name">목표 이름</label>
        <input
          id="goal-name"
          className="input"
          value={name}
          maxLength={20}
          onChange={(e) => (setName(e.target.value), setNameTouched(true))}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'goal-name-err' : 'goal-name-help'}
        />
        {err('name') ?? (
          <p id="goal-name-help" className="meta">
            화면에만 보여요. AI에는 보내지 않아요.
          </p>
        )}
      </div>

      <div className="goal-form-row">
        <div className="field">
          <label htmlFor="goal-amount">목표 금액</label>
          <div className="input-affix">
            <input
              id="goal-amount"
              className="input num"
              inputMode="numeric"
              placeholder="1,000,000"
              value={amount}
              onChange={(e) => setAmount(grouped(e.target.value))}
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? 'goal-amount-err' : undefined}
            />
            <span className="unit">원</span>
          </div>
          {err('amount')}
        </div>
        <div className="field">
          <label htmlFor="goal-due">기한</label>
          <input
            id="goal-due"
            className="input"
            type="month"
            min={monthFromNow(1)}
            max={monthFromNow(120)}
            value={dueMonth}
            onChange={(e) => setDueMonth(e.target.value)}
            aria-invalid={!!errors.dueMonth}
            aria-describedby={errors.dueMonth ? 'goal-dueMonth-err' : undefined}
          />
          {err('dueMonth')}
        </div>
      </div>

      {appSeed ? (
        <div className="card-sunken goal-seed-note">
          <p>
            앱에서 확정한 시드머니 <b className="num">{won(appSeed.total)}원</b>, 매달 저축할 돈 <b className="num">{won(appSeed.monthlyGoal)}원</b>으로 계산해요.
          </p>
        </div>
      ) : (
        <fieldset className="goal-manual">
          <legend className="field-label">지금 상황(선택)</legend>
          <div className="goal-form-row">
            <div className="field">
              <label htmlFor="goal-current">지금 모은 돈</label>
              <div className="input-affix">
                <input
                  id="goal-current"
                  className="input num"
                  inputMode="numeric"
                  placeholder="0"
                  value={current}
                  onChange={(e) => setCurrent(grouped(e.target.value))}
                  aria-invalid={!!errors.currentAmount}
                />
                <span className="unit">원</span>
              </div>
              {err('currentAmount')}
            </div>
            <div className="field">
              <label htmlFor="goal-pace">매달 모을 수 있는 돈</label>
              <div className="input-affix">
                <input
                  id="goal-pace"
                  className="input num"
                  inputMode="numeric"
                  placeholder="0"
                  value={pace}
                  onChange={(e) => setPace(grouped(e.target.value))}
                  aria-invalid={!!errors.monthlyPace}
                />
                <span className="unit">원</span>
              </div>
              {err('monthlyPace')}
            </div>
          </div>
          {link.data?.enabled && (
            <p className="meta">
              {link.data.linked ? '앱에서 예산을 정하고 시드머니를 반영하면 자동으로 채워져요. ' : '앱을 연동하면 자동으로 채워져요. '}
              <Link to="/me#app-link">앱 연동 보기</Link>
            </p>
          )}
        </fieldset>
      )}

      {save.isError && !fieldErr && (
        <p className="form-error" role="alert">
          저장하지 못했어요. {errorText(save.error)}
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? '저장하는 중' : save.isError && !fieldErr ? '다시 시도' : '저장'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-line" onClick={onCancel}>
            취소
          </button>
        )}
      </div>
    </form>
  );
}

/* ───────── 목표 보기 ───────── */

function GoalView({ goal, ai, onEdit }: { goal: Goal; ai: GoalAi; onEdit: () => void }) {
  const del = useDeleteGoal();
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div className="g84">
      <div className="col">
        <ProgressCard goal={goal} onEdit={onEdit} />
        <CoachCard goal={goal} ai={ai} />
        {goal.scenarios.length > 0 && <Scenarios goal={goal} />}
      </div>
      <aside className="col rail" aria-label="점검표와 목표 관리">
        {goal.checkpoints.length > 0 && <Checkpoints goal={goal} />}
        <div className="card">
          <h2>목표 관리</h2>
          <p className="meta" style={{ marginTop: 4 }}>
            {fmtMonthDayTime(goal.updatedAt)}에 저장했어요
          </p>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn btn-line btn-sm" onClick={onEdit}>
              수정
            </button>
            <button className="btn btn-line btn-sm" onClick={() => setConfirmDel(true)}>
              삭제
            </button>
          </div>
          {del.isError && (
            <p className="form-error" role="alert" style={{ marginTop: 8 }}>
              지우지 못했어요. {errorText(del.error)}
            </p>
          )}
        </div>
      </aside>
      <ConfirmDialog
        open={confirmDel}
        title="목표를 지울까요?"
        confirmLabel="지우기"
        danger
        onConfirm={() => (setConfirmDel(false), del.mutate())}
        onCancel={() => setConfirmDel(false)}
      >
        <p>목표와 AI 안내가 함께 지워지고 되돌릴 수 없어요. 오늘 쓴 AI 안내 횟수는 그대로예요.</p>
      </ConfirmDialog>
    </div>
  );
}

function ProgressCard({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const p = goal.progress;
  const st = STATUS[p.status];
  const pct = p.ratioBp / 100;
  return (
    <div className="card goal-progress">
      <div className="card-head">
        <div>
          <p className="goal-name">
            {goal.name} <span className="tag">{categoryLabel(goal.category)}</span>
          </p>
          <p className="meta">{fmtMonth(goal.dueMonth)}까지</p>
        </div>
        <span className={'goal-status ' + st.cls}>{st.label}</span>
      </div>
      <p className="goal-amounts num">
        <b>{won(p.current)}원</b>
        <span> / {won(goal.amount)}원</span>
      </p>
      <div
        className="goal-track"
        role="progressbar"
        aria-label="목표 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(pct)}
        aria-valuetext={`${Math.floor(pct)}%`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="goal-track-foot meta">
        <span className="num">{Math.floor(pct)}%</span>
        <span className="num">{p.remaining > 0 ? `남은 금액 ${won(p.remaining)}원` : '목표 금액을 모두 모았어요'}</span>
      </div>
      <Lead goal={goal} onEdit={onEdit} />
      <p className="meta goal-source">
        {goal.seed.source === 'app'
          ? `앱에서 확정한 시드머니 기준 · ${fmtMonthDayTime(goal.seed.asOf)}`
          : `직접 넣은 금액 기준 · ${fmtMonthDayTime(goal.seed.asOf)}`}
      </p>
    </div>
  );
}

/** 상태별 한 줄. 숫자는 모두 서버 값 */
function Lead({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const p = goal.progress;
  switch (p.status) {
    case 'REACHED':
      return <p className="goal-lead">목표 금액에 닿았어요. 새 목표를 세워 보세요.</p>;
    case 'OVERDUE':
      return (
        <div className="goal-lead">
          <p>{fmtMonth(goal.dueMonth)} 기한이 지났어요. 남은 금액에 맞춰 기한을 새로 정해 보세요.</p>
          <button className="btn btn-primary btn-sm" onClick={onEdit}>
            기한 새로 정하기
          </button>
        </div>
      );
    case 'NO_PACE':
      return (
        <div className="goal-lead">
          <p>
            매달 <b className="num">{won(p.requiredMonthly ?? 0)}원</b> 남기면 돼요.
          </p>
          <p className="meta">매달 모을 수 있는 돈을 넣으면 언제 닿는지도 알려 드려요.</p>
        </div>
      );
    case 'BEHIND':
      return (
        <div className="goal-lead">
          <p>
            매달 <b className="num">{won(p.requiredMonthly ?? 0)}원</b> 남기면 돼요.
          </p>
          <p className="meta">
            지금 속도보다 매달 {won(p.monthlyGap)}원, 하루로 치면 {won(p.dailyGap)}원 더 필요해요
            {p.expectedMonth && ` · 지금 속도면 ${fmtMonth(p.expectedMonth)}에 닿아요`}
          </p>
        </div>
      );
    case 'ON_TRACK':
      return (
        <div className="goal-lead">
          <p>
            매달 <b className="num">{won(p.requiredMonthly ?? 0)}원</b> 남기면 돼요.
          </p>
          {p.expectedMonth && <p className="meta">지금 속도면 {fmtMonth(p.expectedMonth)}에 닿아요</p>}
        </div>
      );
  }
}

function Scenarios({ goal }: { goal: Goal }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>이렇게 모으면</h2>
          <p className="meta">남은 {won(goal.progress.remaining)}원을 모으는 방법을 견줘 봤어요</p>
        </div>
      </div>
      <div className="stats goal-scenarios">
        {goal.scenarios.map((s) => (
          <div key={s.key} className={'stat' + (s.key === 'MEET_DUE' ? ' goal-scn-main' : '')}>
            <span className="lbl">{SCENARIO[s.key]}</span>
            <p className="val num">매달 {won(s.monthly)}원</p>
            <p className="meta">{fmtMonth(s.reachMonth)}에 닿아요</p>
          </div>
        ))}
      </div>
      <p className="meta" style={{ marginTop: 12 }}>
        이자·물가는 넣지 않고 모은 돈만으로 계산했어요. 금리를 보려면 <Link to="/savings">적금 모아보기</Link>에서 확인해 보세요.
      </p>
    </div>
  );
}

function Checkpoints({ goal }: { goal: Goal }) {
  return (
    <div className="card">
      <h2>중간 점검표</h2>
      <p className="meta" style={{ marginTop: 4 }}>
        매달 {won(goal.progress.requiredMonthly ?? 0)}원씩 모으면 이때 여기에 닿아요
      </p>
      <ol className="goal-checks">
        {goal.checkpoints.map((c) => (
          <li key={c.percent}>
            <span className="pct num">{c.percent}%</span>
            <span className="when">{fmtMonth(c.month)}</span>
            <b className="num">{won(c.target)}원</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ───────── AI 안내 ───────── */

const untilText = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분 뒤` : `${Math.max(1, m)}분 뒤`;
};

function CoachCard({ goal, ai }: { goal: Goal; ai: GoalAi }) {
  const make = useMakeCoach();
  const coach = goal.coach;
  const err = make.error instanceof ApiError ? make.error : null;
  const limited = err?.status === 429;
  const retryAfter = typeof err?.details.retryAfterSeconds === 'number' ? err.details.retryAfterSeconds : null;
  const outOfFree = limited || (ai.available && ai.remainingToday <= 0);
  // 숫자가 그대로면 다시 만들어도 같은 결과다(AI 안내는 서버가 저장본을 돌려주고, 키가 없으면 같은 기본 안내. goal-ai.md §3 POST 2·3)
  const upToDate = !!coach && !coach.stale && (coach.aiGenerated || !ai.available);
  const label = make.isPending ? '만드는 중' : coach ? '다시 만들기' : 'AI 안내 만들기';

  return (
    <div className="card goal-coach" aria-busy={make.isPending}>
      <div className="card-head">
        <div>
          <h2>
            목표 달성 안내 {coach && (coach.aiGenerated ? <span className="tag tag-ai">AI</span> : <span className="tag">기본 안내</span>)}
          </h2>
          <p className="meta">
            {ai.available ? `오늘 무료 ${ai.remainingToday}/${ai.limitPerDay}회 남음` : 'AI 안내 준비 중 · 기본 안내로 보여 드려요'}
          </p>
        </div>
        {!outOfFree && !upToDate && (
          <button className="btn btn-primary btn-sm" onClick={() => make.mutate({ id: goal.id, version: goal.version })} disabled={make.isPending}>
            {label}
          </button>
        )}
      </div>

      {upToDate && <p className="meta" style={{ marginBottom: 12 }}>목표나 모은 돈이 바뀌면 새 숫자로 다시 만들 수 있어요.</p>}
      {coach?.stale && !make.isPending && (
        <div className="goal-stale" role="status">
          목표나 모은 돈이 바뀌었어요. 다시 만들면 지금 숫자로 안내해요.
        </div>
      )}

      {make.isPending ? (
        <div className="goal-coach-body" aria-label="안내를 만드는 중">
          <div className="skel" style={{ height: 22, width: '70%' }} />
          <div className="skel" style={{ height: 14, marginTop: 12 }} />
          <div className="skel" style={{ height: 14, width: '85%', marginTop: 8 }} />
          <div className="skel" style={{ height: 64, marginTop: 16 }} />
        </div>
      ) : coach ? (
        <CoachBody coach={coach} showReason={ai.available} />
      ) : (
        <p className="sub">
          버튼을 누르면 내 목표 숫자에 맞춰 한 줄 요약과 실천 단계 3가지를 만들어 드려요. 목표 이름은 보내지 않아요.
        </p>
      )}

      {outOfFree && (
        <div className="goal-upsell" role={limited ? 'alert' : undefined}>
          <p>
            <b>오늘 무료 AI 안내를 다 썼어요.</b>{' '}
            {retryAfter != null ? `${untilText(retryAfter)} 다시 쓸 수 있어요.` : '내일 0시에 다시 채워져요.'}
          </p>
          <p className="meta">플러스에서는 AI 안내를 더 많이 쓸 수 있게 준비하고 있어요.</p>
          <Link className="btn btn-line btn-sm" to="/plus">
            플러스 알아보기
          </Link>
        </div>
      )}
      {err && !limited && (
        <p className="form-error" role="alert">
          {err.status === 409 ? '안내를 만드는 동안 목표가 바뀌었어요. 바뀐 목표로 다시 만들어 주세요.' : errorText(err)}
        </p>
      )}
      {make.error && !err && (
        <p className="form-error" role="alert">
          {errorText(make.error)}
        </p>
      )}
    </div>
  );
}

function CoachBody({ coach, showReason }: { coach: Coach; showReason: boolean }) {
  return (
    <div className="goal-coach-body">
      <p className="goal-headline">{coach.headline}</p>
      <p className="sub">{coach.summary}</p>
      <ol className="goal-steps">
        {coach.steps.map((s, i) => (
          <li key={i}>
            <b>{s.title}</b>
            <p>{s.detail}</p>
          </li>
        ))}
      </ol>
      {/* 키가 없을 때는 카드 머리에 이미 '준비 중'을 적었다 */}
      {showReason && !coach.aiGenerated && coach.fallbackReason && <p className="meta">{FALLBACK[coach.fallbackReason]}</p>}
      <div className="disclaimer">
        <svg width="14" height="14" aria-hidden="true">
          <use href="#i-info" />
        </svg>
        <span>
          {coach.notice} · {fmtMonthDayTime(coach.generatedAt)}
          {coach.aiGenerated && coach.model ? ` · ${coach.model}` : ''}
        </span>
      </div>
    </div>
  );
}
