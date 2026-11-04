import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useLoginModal } from '@/components/LoginModal';
import {
  FALLBACK_TEXT, GOAL_LIMITS, GOAL_PRESETS, TYPE_LABEL, deleteSavedScenario, fetchGoalScenarios, getSavedScenario, listSavedScenarios, saveScenario,
  type GoalScenario, type GoalScenarioResult, type SavedGoalScenario, type SavedScenarioList, type ScenarioProduct, type ScenarioProductType,
} from '@/data/goalScenarios';
import { ApiError, errorText } from '@/lib/api';
import '@/styles/goal-plan.css';

// F7 v2 목표 달성 시나리오(/goal, Issue #175·#201, docs/policies.md §7).
// 금액·확률·비중은 모두 서버 계산 값이고, 화면은 그리기만 한다(ADR-3). 회원은 시나리오를 그때 결과 그대로 최대 5개 저장한다(§7-8).
const COLORS: Record<ScenarioProductType, string> = {
  SAVINGS: 'var(--color-series-1)', CMA: 'var(--color-series-3)', KR_INDEX_ETF: 'var(--color-series-2)',
  US_INDEX_ETF: 'var(--color-series-4)', KOSPI_TOP5: 'var(--color-series-5)',
};

const AI_REUSE_TIP = '같은 조건으로 만든 AI 조합은 횟수가 차감되지 않아요.';
const won = (n: number) => n.toLocaleString('ko-KR');
/** 표시용 만 원 단위(내림). 서버 값을 읽기 쉽게 바꿀 뿐 계산 결과를 바꾸지 않는다. */
function manwon(n: number) {
  const man = Math.floor(n / 10_000);
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (!eok && !rest) return `${won(n)}원`;
  return [eok ? `${eok}억` : '', rest ? `${won(rest)}만` : ''].filter(Boolean).join(' ') + ' 원';
}
const pct = (bp: number) => `${Math.floor(bp / 100)}%`;
const digits = (s: string) => s.replace(/[^0-9]/g, '');
const savedDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');

function productName(p: ScenarioProduct | undefined, type: ScenarioProductType) {
  if (!p) return { name: TYPE_LABEL[type], kind: '' };
  if (type === 'KOSPI_TOP5') return { name: TYPE_LABEL[type], kind: `${p.items.slice(0, 2).map((i) => i.name).join('·')} 등 같은 금액` };
  if (type === 'SAVINGS') return { name: p.items[0].name, kind: `적금 · ${p.items[0].company ?? ''} · 기본금리 연 ${p.ratePercent}%` };
  if (type === 'CMA') return { name: 'CMA', kind: `수시 입출금 · 연 ${p.ratePercent}% (예시 금리)` };
  return { name: p.items[0].name, kind: TYPE_LABEL[type] };
}

function RangeBar({ low, median, high, target }: { low: number; median: number; high: number; target: number }) {
  const min = Math.min(low, target) * 0.92;
  const max = Math.max(high, target) * 1.04;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return <div className="gp-range" role="img" aria-label={`잘 안 풀릴 때 ${manwon(low)}, 보통 ${manwon(median)}, 잘 풀릴 때 ${manwon(high)}, 목표 ${manwon(target)}`}>
    <span className="gp-range-track" />
    <span className="gp-range-fill" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
    <span className="gp-range-median" style={{ left: pos(median) }} />
    <span className="gp-range-target" style={{ left: pos(target) }}><span>목표</span></span>
  </div>;
}

/** 시나리오 하나의 상품 배분·예상 금액·해설. 방금 계산한 결과와 저장한 결과가 같이 쓴다. */
function PlanDetail({ plan, products, targetAmount, years, demo }: {
  plan: GoalScenario; products: ScenarioProduct[]; targetAmount: number; years: number; demo: boolean;
}) {
  const productOf = (t: ScenarioProductType) => products.find((p) => p.type === t);
  return <>
    <div className="gp-detail">
      <div className="gp-card">
        <h3 className="gp-h3">어떤 상품에, 매달 얼마씩? <span className="gp-badge gp-badge-muted">{demo ? '예시 비중' : 'AI 제안 비중'}</span></h3>
        <div className="gp-bar" role="img" aria-label={plan.mix.map((m) => `${productName(productOf(m.type), m.type).name} ${m.ratioPercent}%`).join(', ')}>
          {plan.mix.map((m) => <span key={m.type} style={{ width: `${m.ratioPercent}%`, background: COLORS[m.type] }} />)}
        </div>
        <ul className="gp-products">
          {plan.mix.map((m) => {
            const p = productName(productOf(m.type), m.type);
            return <li key={m.type}>
              <span className="gp-dot" style={{ background: COLORS[m.type] }} />
              <span className="gp-product-name">{p.name}<small>{p.kind}</small></span>
              <span className="gp-product-amt num">{m.monthly !== null ? `월 ${won(m.monthly)}원` : '-'}</span>
              <span className="gp-product-pct num">{m.ratioPercent}%</span>
            </li>;
          })}
        </ul>
      </div>
      <div className="gp-card">
        <h3 className="gp-h3">{years}년 뒤 예상 금액 {plan.paid !== null && <span className="gp-badge gp-badge-muted">넣은 돈 {manwon(plan.paid)}</span>}</h3>
        {!plan.outcome
          ? <div className="gp-fixed">목표 금액 안의 월 금액으로는 10번 중 8번 목표에 닿지 못했어요. 기한을 늘리거나 목표를 조정해 보세요.</div>
          : plan.outcome.kind === 'FIXED' && plan.outcome.fixedAmount !== null
            ? <div className="gp-fixed">이자가 정해진 상품만 있어 결과가 하나로 정해져요.<b className="num">{manwon(plan.outcome.fixedAmount)}</b>목표 {manwon(targetAmount)} 달성 · 세후 이자 포함</div>
            : plan.outcome.low !== null && plan.outcome.median !== null && plan.outcome.high !== null && <>
              <RangeBar low={plan.outcome.low} median={plan.outcome.median} high={plan.outcome.high} target={targetAmount} />
              <div className="gp-range-legend">
                <div>잘 안 풀릴 때<b className="num">{manwon(plan.outcome.low)}</b>하위 10%</div>
                <div className="gp-range-mid">보통<b className="num">{manwon(plan.outcome.median)}</b>중간값</div>
                <div>잘 풀릴 때<b className="num">{manwon(plan.outcome.high)}</b>상위 10%</div>
              </div>
            </>}
      </div>
    </div>
    <div className="gp-card gp-ai">
      <h3 className="gp-h3">{demo ? '조합 해설' : 'AI 해설'} {demo && <span className="gp-badge gp-badge-muted">예시 문구</span>}</h3>
      <p>{plan.explanation}</p>
    </div>
  </>;
}

function Assumptions({ paths, returnsFrom, returnsTo, assumptions, notice }: { paths: number; returnsFrom: string; returnsTo: string; assumptions: string[]; notice: string }) {
  return <>
    <details className="gp-assumptions">
      <summary>계산 방법과 가정</summary>
      <ul>
        <li><b>필요한 월 금액</b>: 매달 이 금액을 넣으면, 계산해 본 {won(paths)}가지 경우 중 10번에 8번은 목표 이상 모여요. 적금·CMA만 있는 조합은 이자가 정해져 있어 금액이 확정돼요.</li>
        <li><b>{won(paths)}가지 경우</b>: {returnsFrom}부터 {returnsTo}까지 상품이 실제로 오르내린 기록을 1년 단위로 잘라, 무작위로 이어 붙여 만든 가상의 미래예요. 같은 입력이면 늘 같은 결과가 나와요.</li>
        <li><b>원금 손실 가능성</b>: 넣은 돈보다 적게 남은 경우의 비율이에요.</li>
        {assumptions.map((a) => <li key={a}>{a}</li>)}
      </ul>
    </details>
    <p className="gp-foot">{notice}</p>
  </>;
}

/** 저장한 시나리오를 저장할 때 값 그대로 보여 주는 모달. Esc·[닫기]·바깥 클릭으로 닫는다. */
function SavedScenarioDialog({ viewing, loading, onClose, onRecalc }: {
  viewing: SavedGoalScenario | null; loading: boolean; onClose: () => void; onRecalc: (v: SavedGoalScenario) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (viewing && !d.open) d.showModal();
    if (!viewing && d.open) d.close();
  }, [viewing]);

  return <dialog ref={ref} className="gp-view-dialog" aria-labelledby="gp-view-title"
    onCancel={(e) => { e.preventDefault(); onClose(); }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    {viewing && <div className="gp-view-body">
      <div className="gp-view-head">
        <div>
          <h2 id="gp-view-title" className="gp-view-name">{viewing.name}</h2>
          <p className="gp-view-meta">{viewing.scenario.title} · {viewing.years}년 뒤 {manwon(viewing.targetAmount)} · {savedDate(viewing.savedAt)}에 저장
            <span className="gp-badge">{viewing.asOf} 기준 결과</span></p>
        </div>
        <button type="button" className="gp-text-btn" onClick={onClose} autoFocus>닫기</button>
      </div>
      {viewing.scenario.reachable && viewing.scenario.monthly !== null && <p className="gp-insight">
        그때 계산으로는 매달 <b className="num">{won(viewing.scenario.monthly)}원</b>을 넣으면 {viewing.scenario.outcome?.kind === 'FIXED' ? '목표에 닿아요(확정).' : '10번 중 8번은 목표에 닿았어요.'}
      </p>}
      <PlanDetail plan={viewing.scenario} products={viewing.products} targetAmount={viewing.targetAmount} years={viewing.years} demo={viewing.proposer === 'DEMO'} />
      <Assumptions paths={viewing.paths} returnsFrom={viewing.returnsFrom} returnsTo={viewing.returnsTo} assumptions={viewing.assumptions} notice={viewing.notice} />
      <div className="gp-view-actions">
        <button type="button" className="gp-secondary" onClick={() => onRecalc(viewing)} disabled={loading}>지금 시세로 다시 계산하기</button>
        <button type="button" className="gp-text-btn" onClick={onClose}>닫기</button>
      </div>
    </div>}
  </dialog>;
}

export default function GoalScenarios() {
  const { status } = useSession();
  const { openLogin } = useLoginModal();
  const location = useLocation();
  const member = status === 'member';

  const [name, setName] = useState(GOAL_PRESETS[0].name);
  const [amount, setAmount] = useState(won(GOAL_PRESETS[0].amount));
  const [years, setYears] = useState<1 | 2 | 3>(GOAL_PRESETS[0].years);
  const [result, setResult] = useState<GoalScenarioResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [savedList, setSavedList] = useState<SavedScenarioList | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [viewing, setViewing] = useState<SavedGoalScenario | null>(null);
  const [toDelete, setToDelete] = useState<number | null>(null);
  const [listError, setListError] = useState('');

  const resultRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => () => { requestId.current++; }, []);

  const scrollTo = (el: HTMLElement | null) =>
    requestAnimationFrame(() => el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));

  const refreshSaved = useCallback(async () => {
    try {
      setSavedList(await listSavedScenarios());
      setListError('');
    } catch (err) {
      setListError(errorText(err, '저장한 시나리오를 불러오지 못했어요'));
    }
  }, []);

  useEffect(() => {
    if (member) { void refreshSaved(); return; }
    // 로그아웃하면 이전 회원의 결과(AI 횟수 포함)·저장 목록·보던 모달을 지우고, 진행 중인 요청의 응답은 버린다.
    requestId.current++;
    setLoading(false);
    setResult(null);
    setSelected(null);
    setViewing(null);
    setToDelete(null);
    setSavedList(null);
    setSavedIds({});
    setSaveMessage('');
  }, [member, refreshSaved]);

  const amountValue = Number(digits(amount) || 0);
  const preset = GOAL_PRESETS.find((c) => c.amount === amountValue && c.years === years && c.name === name);

  const run = async (q: { name: string; targetAmount: number; years: 1 | 2 | 3 }) => {
    const trimmed = q.name.trim();
    if (!trimmed || trimmed.length > GOAL_LIMITS.nameMax) { setError(`목표 이름은 1~${GOAL_LIMITS.nameMax}자로 적어 주세요.`); return; }
    if (q.targetAmount < GOAL_LIMITS.amountMin || q.targetAmount > GOAL_LIMITS.amountMax) { setError('목표 금액은 100만 원부터 10억 원까지 넣을 수 있어요.'); return; }
    setError('');
    setSaveMessage('');
    setLoading(true);
    const id = ++requestId.current;
    try {
      const r = await fetchGoalScenarios({ name: trimmed, targetAmount: q.targetAmount, years: q.years });
      if (id !== requestId.current) return;
      setResult(r);
      setSavedIds({});
      setViewing(null);
      setSelected(r.scenarios.find((s) => s.id === 'spread')?.id ?? r.scenarios[0]?.id ?? null);
      scrollTo(resultRef.current);
    } catch (err) {
      if (id !== requestId.current) return;
      setResult(null);
      setError(err instanceof ApiError && err.status === 503
        ? '계산에 필요한 시세·적금 공시를 아직 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.'
        : errorText(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run({ name, targetAmount: amountValue, years });
  };

  const plan = result?.scenarios.find((s) => s.id === selected) ?? null;
  const demo = result?.proposer === 'DEMO';
  const full = !!savedList && savedList.items.length >= savedList.limit;

  const save = async () => {
    if (!result || !plan) return;
    if (!member) { openLogin(location.pathname); return; }
    setSaving(true);
    setSaveMessage('');
    try {
      await saveScenario({ resultId: result.resultId, scenarioId: plan.id });
      setSavedIds((m) => ({ ...m, [plan.id]: true }));
      setSaveMessage(`'${result.name}' 시나리오를 저장했어요. 저장한 시나리오에서 다시 볼 수 있어요.`);
      void refreshSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'GOAL_SCENARIO_LIMIT') setSaveMessage('시나리오는 5개까지 저장할 수 있어요. 저장한 시나리오에서 하나를 지운 뒤 다시 저장해 주세요.');
      else if (err instanceof ApiError && err.code === 'GOAL_SCENARIO_EXPIRED') setSaveMessage('계산한 지 30분이 지나 저장할 수 없어요. [시나리오 보기]로 다시 계산해 주세요.');
      else setSaveMessage(errorText(err, '저장하지 못했어요'));
    } finally {
      setSaving(false);
    }
  };

  const open = async (id: number) => {
    try {
      setViewing(await getSavedScenario(id));
      setListError('');
    } catch (err) {
      setListError(errorText(err, '시나리오를 불러오지 못했어요'));
      void refreshSaved();
    }
  };

  const remove = async () => {
    const id = toDelete;
    setToDelete(null);
    if (id === null) return;
    try {
      await deleteSavedScenario(id);
      if (viewing?.id === id) setViewing(null);
    } catch (err) {
      setListError(errorText(err, '지우지 못했어요'));
    }
    void refreshSaved();
  };

  const recalc = (v: SavedGoalScenario) => {
    const y = (v.years === 2 || v.years === 3 ? v.years : 1) as 1 | 2 | 3;
    setName(v.name);
    setAmount(won(v.targetAmount));
    setYears(y);
    void run({ name: v.name, targetAmount: v.targetAmount, years: y });
  };

  return <div className="gp-page">
    <div className={`gp-wrap ${member ? 'gp-wrap-side' : ''}`}>
      <div className="gp-crumb">AI 목표 달성 {(!result || result.isSample) && <span className="gp-badge">예시 포함</span>}</div>
      <h1 className="gp-title">목표만 알려 주세요.<br />모으는 방법은 AI가 같이 찾아 볼게요.</h1>
      <p className="gp-lead">적금·CMA·지수 ETF·주식을 섞은 조합마다, 매달 얼마를 넣어야 하는지 비교해 보세요.</p>

      <div className={member ? 'gp-layout' : undefined}>
      <div className="gp-main">

      <section aria-labelledby="gp-form-title">
        <h2 id="gp-form-title" className="gp-h2"><span className="gp-step">1</span>나의 목표</h2>
        <p className="gp-sub">세 가지만 입력하면 돼요. 마음에 드는 시나리오는 로그인하고 저장할 수 있어요.</p>
        <form className="gp-card" onSubmit={submit} noValidate>
          <div className="gp-form">
            <div className="gp-field gp-field-name">
              <label htmlFor="gp-name">목표 이름</label>
              <input id="gp-name" value={name} maxLength={GOAL_LIMITS.nameMax} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="gp-field">
              <label htmlFor="gp-amount">목표 금액</label>
              <div className="gp-unit">
                <input id="gp-amount" className="num" inputMode="numeric" value={amount} onChange={(e) => { const d = digits(e.target.value).slice(0, 10); setAmount(d ? won(Number(d)) : ''); }} />
                <span>원</span>
              </div>
            </div>
            <div className="gp-field">
              <label htmlFor="gp-years">목표 기한</label>
              <select id="gp-years" value={years} onChange={(e) => setYears(Number(e.target.value) as 1 | 2 | 3)}>
                <option value={1}>1년 뒤</option><option value={2}>2년 뒤</option><option value={3}>3년 뒤</option>
              </select>
            </div>
            <button type="submit" className="gp-primary" disabled={loading}>{loading ? '계산 중…' : '시나리오 보기'}</button>
          </div>
          <div className="gp-chips" role="group" aria-label="목표 예시로 채우기">
            <small>예시로 채우기</small>
            {GOAL_PRESETS.map((c) => <button type="button" key={c.id} className="gp-chip" aria-pressed={preset?.id === c.id}
              onClick={() => { setName(c.name); setAmount(won(c.amount)); setYears(c.years); setError(''); }}>{c.chip}</button>)}
          </div>
          {error && <p className="gp-error" role="alert">{error}</p>}
          <p className="gp-help">시작 금액은 0원으로 계산해요. 기한은 1~3년까지 고를 수 있어요.</p>
        </form>
      </section>

      {loading && <div className="gp-loading" role="status"><span className="gp-spinner" />상품 목록에서 조합을 고르고, 2,000가지 경우를 계산하고 있어요…</div>}

      <div ref={resultRef}>
        {result && plan && !loading && <section aria-labelledby="gp-result-title">
          <h2 id="gp-result-title" className="gp-h2"><span className="gp-step">2</span>{demo ? '세 가지 방법' : 'AI가 고른 방법'}
            {demo ? <span className="gp-badge gp-badge-muted">예시 조합</span> : <span className="gp-badge">AI 조합</span>}
            {result.aiUsage && <span className="gp-usage">
              <span className="gp-badge gp-badge-muted">오늘 AI 조합 {result.aiUsage.remainingToday}/{result.aiUsage.limitPerDay}회 남음</span>
              <span className="gp-help-tip">
                <button type="button" className="gp-help-mark" aria-label="AI 조합 횟수 안내" aria-describedby="gp-usage-tip">?</button>
                <span id="gp-usage-tip" role="tooltip" className="gp-tip">{AI_REUSE_TIP}</span>
              </span>
            </span>}</h2>
          {demo && result.fallbackReason && <div className="gp-fallback" role="status">
            <span>{FALLBACK_TEXT[result.fallbackReason]}</span>
            {result.fallbackReason === 'GUEST' && <button type="button" className="gp-secondary" onClick={() => openLogin(location.pathname)}>로그인하고 AI 조합 받기</button>}
          </div>}
          <div className="gp-summary">
            <div><b>{result.name}</b> · {result.years}년 뒤 {manwon(result.targetAmount)} · 시작 금액 0원</div>
            <span className="gp-badge">자료 기준일 {result.asOf}</span>
          </div>
          {result.years === 1 && <p className="gp-insight">기한이 짧으면 투자를 섞어도 월 금액이 크게 줄지 않아요. 오르내림을 회복할 시간이 부족해서예요.</p>}

          <div className="gp-plans">
            {result.scenarios.map((s, i) => <button type="button" key={s.id} className="gp-plan" aria-pressed={selected === s.id} onClick={() => { setSelected(s.id); setSaveMessage(''); }}>
              <span className="gp-plan-tag">PLAN 0{i + 1}{savedIds[s.id] && <span className="gp-saved-mark">저장함</span>}</span>
              <span className="gp-plan-title">{s.title}</span>
              <span className="gp-plan-desc">{s.summary}</span>
              {s.reachable && s.outcome && s.monthly !== null ? <>
                <span className="gp-plan-label">{s.outcome.kind === 'FIXED' ? '필요한 월 금액 · 확정' : '필요한 월 금액 · 10번 중 8번 달성'}</span>
                <span className="gp-plan-monthly num">{won(s.monthly)}<small>원</small></span>
              </> : <>
                <span className="gp-plan-label">필요한 월 금액</span>
                <span className="gp-plan-none">이 조합으로는 찾지 못했어요</span>
              </>}
              <span className="gp-mini" aria-hidden="true">{s.mix.map((m) => <span key={m.type} style={{ width: `${m.ratioPercent}%`, background: COLORS[m.type] }} />)}</span>
              {s.outcome && <span className="gp-plan-stats">
                <span>목표 달성 추정<b>{s.outcome.kind === 'FIXED' ? '확정' : pct(s.outcome.chanceBp)}</b></span>
                <span>원금 손실 가능성<b>{s.outcome.kind === 'FIXED' ? '없음' : pct(s.outcome.lossBp)}</b></span>
              </span>}
            </button>)}
          </div>

          <PlanDetail plan={plan} products={result.products} targetAmount={result.targetAmount} years={result.years} demo={demo} />

          <div className="gp-save-row">
            <button type="button" className="gp-secondary" onClick={save} disabled={saving || savedIds[plan.id] || (member && full)}>
              {!member ? '로그인하고 이 시나리오 저장' : savedIds[plan.id] ? '저장했어요' : saving ? '저장 중…' : `'${result.name}' 저장`}
            </button>
            {member && savedList && <span className="gp-save-count">{savedList.items.length}/{savedList.limit}개 저장</span>}
            {member && full && !savedIds[plan.id] && <span className="gp-save-note">5개가 다 찼어요. 저장한 시나리오에서 하나를 지우면 저장할 수 있어요.</span>}
          </div>
          {saveMessage && <p className="gp-save-message" role="status">{saveMessage}</p>}

          <Assumptions paths={result.paths} returnsFrom={result.returnsFrom} returnsTo={result.returnsTo} assumptions={result.assumptions} notice={result.notice} />
        </section>}
      </div>


      <SavedScenarioDialog viewing={viewing} loading={loading} onClose={() => setViewing(null)}
        onRecalc={(v) => { setViewing(null); recalc(v); }} />

      </div>
      {member && <aside className="gp-saved" aria-labelledby="gp-saved-title">
        <h2 id="gp-saved-title" className="gp-h2">저장한 시나리오
          {savedList && <span className="gp-badge gp-badge-muted">{savedList.items.length}/{savedList.limit}</span>}</h2>
        <p className="gp-sub">저장할 때의 결과를 그대로 보여 줘요. 지금 시세로 보려면 [다시 계산하기]를 눌러 주세요.</p>
        {listError && <p className="gp-error" role="alert">{listError}</p>}
        {savedList && savedList.items.length === 0 && <div className="gp-card gp-saved-empty">아직 저장한 시나리오가 없어요.</div>}
        {savedList && savedList.items.length > 0 && <ul className="gp-saved-list">
          {savedList.items.map((s) => <li key={s.id} className={`gp-card gp-saved-item gp-saved-item-side ${viewing?.id === s.id ? 'is-open' : ''}`}>
            <div className="gp-saved-main">
              <b className="gp-saved-name">{s.name}</b>
              <span>{s.title} · {s.years}년 뒤 {manwon(s.targetAmount)}</span>
              <small>{s.reachable && s.monthly !== null ? `월 ${won(s.monthly)}원${s.kind === 'FIXED' ? ' · 확정' : ' · 10번 중 8번'}` : '월 금액을 찾지 못한 조합'} · {s.asOf} 기준 · {savedDate(s.savedAt)} 저장</small>
            </div>
            <div className="gp-saved-actions">
              <button type="button" className="gp-text-btn" onClick={() => void open(s.id)} aria-label={`${s.name} ${s.title} 보기`}>보기</button>
              <button type="button" className="gp-text-btn gp-danger" onClick={() => setToDelete(s.id)} aria-label={`${s.name} ${s.title} 지우기`}>지우기</button>
            </div>
          </li>)}
        </ul>}
      </aside>}
      </div>

      <ConfirmDialog open={toDelete !== null} title="저장한 시나리오를 지울까요?" confirmLabel="지우기" danger onConfirm={() => void remove()} onCancel={() => setToDelete(null)}>
        지운 시나리오는 되돌릴 수 없어요.
      </ConfirmDialog>
    </div>
  </div>;
}
