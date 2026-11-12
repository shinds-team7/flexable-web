import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { CandleChart, type EventBand } from '@/charts/CandleChart';
import { AveragePriceRows } from '@/components/AveragePrice';
import { Icon } from '@/components/Icons';
import { useLoginModal } from '@/components/LoginModal';
import { Term } from '@/components/TermTip';
import { LeagueEmblem } from '@/components/LeagueEmblem';
import { PlaybackSpeed, segmentMs, segmentSeconds, type Speed } from '@/components/PlaybackSpeed';
import { BOARD_LABEL, startContestRound, type ContestBoard, type ContestRoundStarted } from '@/data/virtualContest';
import { getVirtualSimStatus, virtualSim, type VirtualSimDecision, type VirtualSimSnapshot, type VirtualSimStarted, type VirtualSimStatus } from '@/data/virtualSim';
import { ApiError, errorText } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/motion';

// 가상 시뮬레이션(decisions/2026-11-04-virtual-simulation 6). 흐름·재생·모달은 과거 시장 연습과 같고, 숫자는 모두 서버 응답을 그대로 보인다.
// 고지 문구는 응답의 isSample로 고른다(예시 세션은 AI·실제 시장 통계 문구를 쓰지 않는다).
// 일반·대회 모두 채점하지 않는다(11-05, #253): 점수·맞음/틀림 없이 공시 직후·그다음 주 가상 등락과 유형 통계만 보인다
// (11-10, decisions/2026-11-10-vsim-ruleset-reaction-window: 사건 봉부터 같은 유형 과거 공시의 움직임을 쓴다).
// contest가 있으면 대회 판(decisions/2026-11-05-virtual-sim-contest 3): 투자금 입력 없이 대회 잔액 전부로 시작하고
// 끝나거나 그만두면 서버가 남은 사건을 유지로 끝까지 돌려 잔액에 반영한다.
// 일반 판은 레버리지 1·2·3배를 고른다(policies §8-9, decisions/2026-11-11-vsim-leverage): 2·3배는 회원만, 가격·자산은 서버가 배율로 바꾼 값이고
// 판정 뒤 움직임·유형 통계는 기초 종목 기준, 끝나면 기초 종목·레버리지 가격의 구간 수익률을 나란히 보인다.
const fmt = new Intl.NumberFormat('ko-KR');
const money = (n: number) => `${fmt.format(n)}원`;
const percent = (n: number) => `${n > 0 ? '▲ ' : n < 0 ? '▼ ' : ''}${Math.abs(n * 100).toFixed(2)}%`;
/** 매매 성과(유지 대비 초과 수익률)는 두 수익률의 차이라 %p로 보인다. 0.018 → "+1.80%p" */
const pp = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(2)}%p`;
const tone = (n: number) => n > 0 ? 'practice-rise' : n < 0 ? 'practice-fall' : '';
/** 문장 안의 부호 있는 수익률. −0.01 → "−1.00%" */
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(2)}%`;
type Leverage = 1 | 2 | 3;
const LEVERAGE_RISK = '레버리지 2배·3배는 기초 종목의 하루 등락률에 배율을 곱해 움직여요. 손실도 배율만큼 커지고, 오르내림이 반복되면 기초 종목이 제자리여도 손실이 날 수 있어요. 가상 종목으로 연습하는 기능이며, 실제 상품의 수익을 보여 주거나 투자를 권하지 않아요.';

/** 레버리지 판 표시(차트·결과) */
function LeverageBadge({ k }: { k: number }) {
  return <span className="vsim-leverage-badge">레버리지 {k}배 · 가상</span>;
}
/** 0.6676 → 66.7(보여 주기만, 내림) */
const share = (n: number) => (Math.floor(n * 1000) / 10).toFixed(1);
type Reveal = { from: number; prev: VirtualSimSnapshot };
type Pending = { path: 'start' | 'step' | 'decision'; body: unknown };

/** AI가 쓴 글 옆 표시. 예시면 AI 표시 대신 "예시" */
function Written({ sample }: { sample: boolean }) {
  return sample ? <span className="tag-ex">예시</span> : <span className="ai-chip"><Icon id="i-ai" size={12} />AI 생성</span>;
}

/** 사건 본문 위 표시(누가 쓴 글인지). 실제 기업이 아니라는 고지는 화면 위 안내·응답 notice에 늘 있다 */
function WrittenNotice({ sample }: { sample: boolean }) {
  return <p className="vsim-written">{sample ? <span className="tag-ex">예시 가상 공시</span> : <span className="ai-chip"><Icon id="i-ai" size={12} />AI가 쓴 가상 공시</span>}</p>;
}

/**
 * 판정 뒤 두 구간: 공시 직후(사건 날 전날 종가 → 다음 날 종가)와 그다음 주(다음 날 종가 → 5번째 거래일 종가). 서버 값 그대로.
 * 레버리지 판이면 이 값은 기초 종목 기준이라 이름을 바꾼다
 */
function TwoMoves({ r, k }: { r: VirtualSimDecision; k: number }) {
  const reaction = r.reactionReturnRate ?? 0, nextWeek = r.nextWeekReturnRate ?? 0;
  return <><b>{k > 1 ? '기초 종목' : '가상 등락'}</b> 공시 직후 <span className={tone(reaction)}>{percent(reaction)}</span> · 그다음 주 <span className={tone(nextWeek)}>{percent(nextWeek)}</span></>;
}

/** 레버리지 판의 같은 두 구간 레버리지 가격 등락(서버 값). 1배 판은 없다 */
function LeveragedMoves({ r, k }: { r: VirtualSimDecision; k: number }) {
  if (r.leveragedReactionReturnRate == null || r.leveragedNextWeekReturnRate == null) return null;
  const reaction = r.leveragedReactionReturnRate, nextWeek = r.leveragedNextWeekReturnRate;
  return <p><b>레버리지 {k}배</b> 공시 직후 <span className={tone(reaction)}>{percent(reaction)}</span> · 그다음 주 <span className={tone(nextWeek)}>{percent(nextWeek)}</span></p>;
}

/** 같은 유형의 공시 직후 통계(룰셋) */
function categoryText(r: VirtualSimDecision, sample: boolean) {
  const n = fmt.format(r.categorySampleCount ?? 0), up = share(r.categoryUpShare ?? 0);
  return sample ? `예시 통계에서 ${r.categoryName} ${n}건 중 ${up}%가 공시 직후 올랐어요.` : `과거 ${r.categoryName} 공시 ${n}건 중 ${up}%가 공시 직후 올랐어요.`;
}

/** 대회 판의 판정 뒤: 채점 없이 이번 두 구간 움직임과 유형 통계만 */
function Moved({ r, sample }: { r: VirtualSimDecision; sample: boolean }) {
  if (!r.movement || r.categoryUpShare == null || r.categorySampleCount == null) return <small>5거래일 뒤 확인해요</small>;
  return <div className="vsim-judged">
    <p><TwoMoves r={r} k={1} /></p>
    <p className="practice-muted">{categoryText(r, sample)}</p>
  </div>;
}

/**
 * 대회 판으로 쓸 때. board: 지금 리그, today: 오늘 매매 성과(가만히 있었을 때 대비) 평균·목표·시작한 판 수(서버 값, 판이 끝나면 onSettled로 다시 불러옴),
 * roundsPerDay: 하루 판 수, dayPoints: 하루 점수 한 칸(서버 규칙에서 고른 값, #308부터 100·이전 서버 1),
 * onSettled: 판이 끝나 잔액이 바뀌었을 수 있을 때, onExit: 대회 화면으로 돌아가기
 */
export type ContestPlay = { board: ContestBoard; today?: { returnRate: number | null; targetRate: number; rounds: number }; roundsPerDay: number; dayPoints: number; onSettled: () => void; onExit: () => void };

/** 일반 세션의 판정 뒤: 유형 통계(근거)와 이번 결과. 채점은 없다. k: 레버리지 배율(움직임·통계는 기초 종목 기준) */
function Judged({ r, sample, k }: { r: VirtualSimDecision; sample: boolean; k: number }) {
  if (!r.movement || r.categoryUpShare == null || r.categorySampleCount == null || !r.trend) return <small>5거래일 뒤 확인해요</small>;
  const moved = r.movement === 'UP' ? 1 : r.movement === 'DOWN' ? -1 : 0;
  // 경향은 공시 없는 날 대비 시장 초과수익 비교라 원 가격 비율로 "반대"를 말하지 않는다(policies §8-6)
  const against = r.trend === 'UP' && moved < 0 ? '시장 움직임을 뺀 수익률이 공시 직후에 공시 없는 날보다 평균 조금 높았던 유형이지만, 이번에는 내렸어요.'
    : r.trend === 'DOWN' && moved > 0 ? '시장 움직임을 뺀 수익률이 공시 직후에 공시 없는 날보다 평균 조금 낮았던 유형이지만, 이번에는 올랐어요.'
    : null;
  return <div className="vsim-judged">
    <p className="practice-muted">{categoryText(r, sample)}</p>
    <p><TwoMoves r={r} k={k} />. {against ?? `이번에는 ${k > 1 ? '기초 종목이 ' : ''}공시 직후 ${moved > 0 ? '올랐어요' : moved < 0 ? '내렸어요' : '그대로였어요'}.`}</p>
    <LeveragedMoves r={r} k={k} />
  </div>;
}

export function VirtualSimulation({ active, onGoPast, contest }: { active: boolean; onGoPast: () => void; contest?: ContestPlay }) {
  const [round, setRound] = useState<ContestRoundStarted['round'] | null>(null);
  const contestRef = useRef(contest); contestRef.current = contest;
  const [status, setStatus] = useState<VirtualSimStatus | null>(null);
  const [amount, setAmount] = useState('1000000');
  // 일반 판의 레버리지 배율. 2·3배는 회원만(비회원은 잠그고 로그인 안내)
  const [leverage, setLeverage] = useState<Leverage>(1);
  const member = useSession().status === 'member';
  const { openLogin } = useLoginModal();
  const location = useLocation();
  useEffect(() => { if (!member) setLeverage(1); }, [member]);
  const [snapshot, setSnapshot] = useState<VirtualSimSnapshot | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [action, setAction] = useState<'BUY' | 'SELL' | 'HOLD' | null>(null);
  // 직접 입력한 주 수(숫자만). 유지는 0
  const [quantity, setQuantity] = useState('');
  // 선택 창을 접어 차트를 다시 볼 수 있게 한다(고른 값은 그대로 둔다)
  const [collapsed, setCollapsed] = useState(false);
  const token = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const latest = useRef<VirtualSimSnapshot | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const focusSetup = useRef(false);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  // 기록에서 누른 사건: 차트로 올라가 그 사건 기간 띠를 계속 강조한다(마우스를 떼도 남는다)
  const [pinnedBand, setPinnedBand] = useState<number | null>(null);
  const chartBox = useRef<HTMLDivElement>(null);
  const articles = useRef<Record<number, HTMLElement | null>>({});
  // 끝나면 "이번 시뮬레이션 돌아보기"로 내려 결과를 바로 보이게 한다
  const journal = useRef<HTMLElement>(null);
  // 재생 속도(저장하지 않는다). 바꾸면 남은 봉부터 새 간격으로 그린다
  const [speed, setSpeed] = useState<Speed>(1);

  const loadStatus = useCallback(async () => {
    const current = generation.current;
    try { const data = await getVirtualSimStatus(); if (current === generation.current) { setStatus(data); setUnavailable(!data.available); setError(''); } }
    catch (e) { if (current === generation.current) { if (e instanceof ApiError && e.status === 503) setUnavailable(true); else setError(errorText(e)); } }
  }, []);
  useEffect(() => { void loadStatus(); return () => {
    generation.current++;
    const existing = token.current; token.current = null;
    if (existing) void virtualSim('end', { sessionToken: existing }).catch(() => {});
  }; }, [loadStatus]);
  const activeRef = useRef(active); activeRef.current = active;
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const show = useCallback((next: VirtualSimSnapshot | null) => {
    const prev = latest.current; latest.current = next; setSnapshot(next);
    if (next && prev && next.frames.length) { setReveal({ from: prev.candles.length, prev }); setShown(prev.candles.length); }
    else { setReveal(null); setShown(next?.candles.length ?? 0); }
  }, []);
  const revealing = !!reveal && !!snapshot && shown < snapshot.candles.length;
  const visibleEvent = revealing ? null : snapshot?.event ?? null;
  // 숨겨진 화면(다른 탭·대회 밖)에 열린 모달이 남으면 top layer에서 페이지를 막으니, 보이는 동안만 연다
  const modalOpen = active && !!visibleEvent && !collapsed;
  useEffect(() => {
    const d = dialog.current;
    if (modalOpen && !d?.open) d?.showModal();
    else if (!modalOpen && d?.open) d.close();
  }, [modalOpen]);
  useEffect(() => {
    setAction(null); setQuantity(''); setCollapsed(false);
    if (visibleEvent) setPlaying(false);
    else playButton.current?.focus({ preventScroll: true });
  }, [visibleEvent?.id]);

  const send = useCallback(async (request: Pending) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); pending.current = request;
    const current = generation.current;
    try {
      const result = request.path === 'start' && contestRef.current
        ? await startContestRound((request.body as { startId: string }).startId)
        : await virtualSim<VirtualSimSnapshot | VirtualSimStarted | ContestRoundStarted>(request.path, request.body);
      if (current !== generation.current) {
        if ('sessionToken' in result) void virtualSim('end', { sessionToken: result.sessionToken }).catch(() => {});
        return;
      }
      const next = 'snapshot' in result ? result.snapshot : result;
      if ('sessionToken' in result) token.current = result.sessionToken;
      if ('round' in result) setRound((result as ContestRoundStarted).round);
      show(next); pending.current = null;
      // 대회 판을 새로 시작하면 오늘 판 수가 바뀌므로 대회 쪽 내 기록을 다시 불러온다
      if (request.path === 'start' && contestRef.current) contestRef.current.onSettled();
      if (request.path !== 'step' && activeRef.current) setPlaying(true);
    } catch (e) {
      if (current !== generation.current) return;
      setPlaying(false); setError(errorText(e));
      if (e instanceof ApiError && request.path === 'start' && e.status === 503 && e.code === 'PRACTICE_UNAVAILABLE' && !contestRef.current) { pending.current = null; setError(''); setUnavailable(true); }
      if (e instanceof ApiError && e.status < 500) {
        pending.current = null;
        if (e.status === 410) { token.current = null; show(null); }
        // 대회 마감 뒤 진행(CONTEST_CLOSED)은 서버가 판을 정산한다. 다시 묻지 않고 대회 화면에서 결과를 보게 한다
        if (e.status === 409 && e.code === 'CONTEST_CLOSED') contestRef.current?.onSettled();
        else if (e.status === 409 && token.current) {
          try { const now = await virtualSim<VirtualSimSnapshot>('state', { sessionToken: token.current }); if (current === generation.current) show(now); }
          catch { setError('현재 상태를 확인하지 못했어요. 새 시뮬레이션을 시작해 주세요.'); }
        }
      }
    } finally { if (current === generation.current) { inFlight.current = false; setBusy(false); } }
  }, [show]);

  useEffect(() => {
    if (!active || !playing || !snapshot || error || revealing || busy || snapshot.status !== 'RUNNING' || document.hidden) return;
    void send({ path: 'step', body: { sessionToken: token.current, commandId: crypto.randomUUID(), expectedVersion: snapshot.version } });
  }, [active, playing, busy, snapshot, revealing, error, send]);
  useEffect(() => {
    if (!playing || !revealing || error) return;
    // 구간 전체가 고른 속도의 시간(1배 3초)에 끝나도록 경과 시간으로 그릴 봉 수를 정한다(일시정지하거나 속도를 바꾸면 그 자리에서 이어서)
    const end = snapshot!.candles.length, gap = segmentMs(speed) / snapshot!.frames.length, from = shown, started = performance.now();
    let timer = 0;
    const tick = () => {
      const next = Math.min(end, from + Math.floor((performance.now() - started) / gap));
      setShown(next);
      if (next < end) timer = window.setTimeout(tick, Math.min(gap, 16));
    };
    timer = window.setTimeout(tick, Math.min(gap, 16));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 시작 위치만 필요하고 매 봉마다 다시 시작하지 않는다
  }, [playing, revealing, error, snapshot, speed]);

  const reset = () => {
    generation.current++; setPlaying(false); show(null); setError(''); setBusy(false); inFlight.current = false; pending.current = null;
    setActiveBand(null); setPinnedBand(null); focusSetup.current = true; setRound(null);
    const old = token.current; token.current = null;
    const play = contestRef.current;
    // 대회 판은 끝내면 서버가 남은 사건을 유지로 정산한다. 정산 뒤 대회 화면으로 돌아간다
    if (old) void virtualSim('end', { sessionToken: old }).catch(() => {}).finally(() => play?.onSettled());
    play?.onExit();
  };
  /** 대회 판: 끝난 판을 닫고 같은 화면에서 바로 다음 판을 시작한다(끝난 판은 이미 정산됨) */
  const nextRound = () => {
    generation.current++; setPlaying(false); show(null); setError(''); setBusy(false); inFlight.current = false; pending.current = null;
    setActiveBand(null); setPinnedBand(null); setRound(null);
    const old = token.current; token.current = null;
    if (old) void virtualSim('end', { sessionToken: old }).catch(() => {});
    void send({ path: 'start', body: { startId: crypto.randomUUID() } });
  };
  const noRoundsLeft = !!round && round.roundsLeftToday === 0;
  useEffect(() => {
    if (snapshot || !focusSetup.current) return;
    focusSetup.current = false;
    amountInput.current?.focus();
  }, [snapshot]);
  const collapse = () => setCollapsed(true);
  const expand = () => setCollapsed(false);
  const start = (event: React.FormEvent) => {
    event.preventDefault();
    if (contest) { void send({ path: 'start', body: { startId: crypto.randomUUID() } }); return; }
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 10000 || value > 100000000) { setError('투자금은 1만 원부터 1억 원까지 원 단위로 입력해 주세요.'); return; }
    void send({ path: 'start', body: { startId: crypto.randomUUID(), initialAmount: value, leverage: member ? leverage : 1 } });
  };
  const choose = (event: React.FormEvent) => {
    event.preventDefault();
    if (!action || !snapshot?.event || revealing || !orderValid) return;
    void send({ path: 'decision', body: { sessionToken: token.current, commandId: crypto.randomUUID(), expectedVersion: snapshot.version,
      eventId: snapshot.event.id, action, quantity: action === 'HOLD' ? 0 : orderQty } });
  };

  // 마지막 봉까지 다 그린 뒤(구간 재생이 끝난 뒤) 한 번 내린다. 숨긴 탭에서는 내리지 않는다
  const done = !revealing && snapshot?.status === 'FINISHED';
  // 대회 판은 완주하면 서버가 잔액을 바꾼다. 대회 화면의 내 기록을 다시 불러온다
  useEffect(() => { if (done) contestRef.current?.onSettled(); }, [done]);
  useEffect(() => {
    if (!done || !activeRef.current) return;
    journal.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [done]);

  const scrollTo = (el: HTMLElement | null | undefined) => el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  /** 기록의 사건을 누르면 차트로 올라가 그 기간을 강조한다. 같은 사건을 다시 누르면 강조를 끈다 */
  const showOnChart = (n: number) => {
    if (pinnedBand === n) { setPinnedBand(null); return; }
    setPinnedBand(n); scrollTo(chartBox.current);
  };

  if (unavailable && !snapshot) {
    return <section className="practice-soon">
      <span className="practice-mode-badge">준비 중</span>
      <h2>가상 시뮬레이션은 아직 준비 중이에요</h2>
      <p>실제 시장 통계와 가상 종목을 준비하고 있어요. 과거 시세로 연습하는 과거 시장 연습은 바로 해 볼 수 있어요.</p>
      <button type="button" className="btn" onClick={onGoPast}>과거 시장 연습으로 가기</button>
    </section>;
  }

  const sample = snapshot?.isSample ?? status?.isSample ?? false;
  const candles = snapshot ? snapshot.candles.slice(0, shown) : [];
  const portfolio = revealing ? (snapshot!.frames[shown - reveal!.from - 1]?.portfolio ?? reveal!.prev.portfolio) : snapshot?.portfolio;
  const decisions = revealing ? reveal!.prev.decisions : snapshot?.decisions ?? [];
  const finished = !revealing && snapshot?.status === 'FINISHED';
  const bands: EventBand[] = decisions.map((r, i) => ({ n: i + 1, from: r.date, to: r.outcomeDate }));
  const restartLabel = contest ? (finished ? '대회 화면으로 돌아가기' : '판 그만하기') : finished ? '다른 가상 종목으로 다시 하기' : '시뮬레이션 종료하고 다시 설정';
  // 대회 판의 정산 값(끝 잔액·유지 비교·매매 성과)은 서버가 마지막 진행 응답에 함께 주지만, 남은 봉을 다 그린 뒤에만 보인다
  const settledContest = finished ? snapshot?.contest : null;
  const endBalance = settledContest?.endBalance ?? null;
  const holdBalance = settledContest?.holdBalance ?? null;
  const excessRate = settledContest?.excessRate ?? null;
  const holdReturnRate = settledContest?.holdReturnRate ?? null;
  const k = snapshot?.leverage ?? 1;
  // 2·3배 판이 끝나면 같은 구간의 기초 종목·레버리지 가격 수익률(서버 값). 남은 봉을 다 그린 뒤에만 보인다
  const leverageResult = finished ? snapshot?.leverageResult ?? null : null;
  // 수량 입력 미리보기: 서버가 준 기준 가격·상한으로 수량 × 기준 가격만 곱한다(추정, 실제 체결은 다음 거래일 시가, policies §8-7)
  const limits = visibleEvent?.orderLimits;
  const orderQty = Number(quantity || 0);
  const orderMax = !limits || !action || action === 'HOLD' ? 0 : action === 'BUY' ? limits.maxBuyShares : limits.maxSellShares;
  const orderValid = action === 'HOLD' || (!!action && Number.isInteger(orderQty) && orderQty >= 1 && orderQty <= orderMax);
  const orderAmount = limits && action && action !== 'HOLD' ? orderQty * limits.referencePrice : 0;
  const after = portfolio && limits && action && action !== 'HOLD' && orderValid
    ? { shares: portfolio.shares + (action === 'BUY' ? orderQty : -orderQty), cash: portfolio.cash + (action === 'BUY' ? -orderAmount : orderAmount) }
    : null;
  const retry = () => { if (pending.current) void send(pending.current); else if (!status) void loadStatus(); else setError(''); };
  return <>
    <div className="practice-notice vsim-notice"><span>가상 종목{sample && <span className="tag-ex">예시</span>}</span><p>가상 종목·가상 사건이에요. 실제 기업이 아니에요.<br />{sample ? '가격은 학습용 예시 통계로 만든 가상 움직임이에요. 실제 시장 통계가 아니에요.' : '가격은 실제 시장 통계로 만든 가상 움직임이에요.'}</p></div>
    {error && <div className="practice-error" role="alert"><p>{error}</p><button className="btn btn-sm" onClick={retry} disabled={busy}>다시 시도</button></div>}
    {/* 대회 판: 진행 내내 위에 붙는 대회 정보 줄(서버 값) */}
    {contest && <div className="vsim-contest-bar" role="status" aria-label="대회 정보">
      <b className="vsim-contest-league"><LeagueEmblem board={contest.board} size={20} />{BOARD_LABEL[contest.board]}</b>
      <span>오늘 <b>{contest.today?.rounds ?? 0}</b>/{contest.roundsPerDay}판{round ? ` · ${round.roundsLeftToday}판 남음` : ''}</span>
      {contest.today && <span><Term k="today" /> <b className={tone(contest.today.returnRate ?? 0)}>{contest.today.returnRate == null ? '—' : pp(contest.today.returnRate)}</b> · 목표 {pp(contest.today.targetRate)} 이상</span>}
    </div>}
    <div className="practice-workspace">
      <aside className="practice-setup">
        {!snapshot && contest ? <>
          <div className="practice-setup-title"><h2>{BOARD_LABEL[contest.board]} 대회 판</h2></div>
          <p className="practice-muted">지금 대회 잔액 전부로 시작하고, 가상 종목 하나를 무작위로 받아요. 사건은 4개이고 채점하지 않아요.</p>
          <form onSubmit={start}>
            <button className="btn btn-primary practice-start" type="submit" disabled={busy || !status}>{!status ? '불러오는 중…' : busy ? '판 준비 중…' : '판 시작'}</button>
            <p className="practice-allocation">처음에는 잔액의 50%로 주식을 사고, 나머지는 현금으로 남겨요. 판이 끝난 총자산이 다음 판의 잔액이 돼요.</p>
          </form>
          <button type="button" className="btn practice-start" onClick={contest.onExit}>대회 화면으로 돌아가기</button>
        </> : !snapshot ? <>
          <div className="practice-setup-title"><h2>어떤 가상 종목을 만날까요?</h2></div>
          <p className="practice-muted">시작하면 가상 종목 하나를 무작위로 받아요. 날짜는 지금부터 10년 뒤의 가상 날짜예요.</p>
          <form onSubmit={start}>
            <fieldset disabled={busy || !status}>
              <div className="practice-amount-label"><label htmlFor="vsimAmount">연습할 투자금</label><small id="vsimAmountHelp">1만 원 ~ 1억 원</small></div>
              <div className="practice-amount"><input ref={amountInput} id="vsimAmount" type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} maxLength={9} aria-describedby="vsimAmountHelp" /><span>원</span></div>
              <div className="practice-amount-presets">{[1000000, 5000000, 10000000].map(n => <button key={n} type="button" onClick={() => setAmount(String(n))}>{fmt.format(n / 10000)}만</button>)}</div>
              <div className="vsim-leverage" role="radiogroup" aria-labelledby="vsimLeverageLabel" aria-describedby="vsimLeverageRisk">
                <div className="practice-amount-label"><span id="vsimLeverageLabel">레버리지 배율</span><small>{member ? '시작한 뒤에는 바꿀 수 없어요' : '2배·3배는 회원 전용'}</small></div>
                <div className="vsim-leverage-options">{([1, 2, 3] as const).map(n => <label key={n} className={leverage === n ? 'selected' : ''}>
                  <input type="radio" name="vsimLeverage" value={n} checked={leverage === n} disabled={n > 1 && !member} onChange={() => setLeverage(n)} />
                  <span>{n}배{n === 1 ? ' (기본)' : ''}</span>
                </label>)}</div>
                {!member && <p className="vsim-leverage-login">2배·3배는 로그인한 회원만 고를 수 있어요. <button type="button" className="btn btn-sm" onClick={() => openLogin(location.pathname + location.search)}>로그인</button></p>}
                <p id="vsimLeverageRisk" className="vsim-leverage-risk">{LEVERAGE_RISK}</p>
              </div>
            </fieldset>
            <button className="btn btn-primary practice-start" type="submit" disabled={busy || !status}>{!status ? '불러오는 중…' : busy ? '시뮬레이션 준비 중…' : '가상 시뮬레이션 시작'}</button>
            <p className="practice-allocation">처음에는 투자금의 50%로 주식을 사고, 나머지는 추가 매수를 위한 현금으로 남겨요.{leverage > 1 ? ` 레버리지 ${leverage}배 가격으로 사고팔아요.` : ''}</p>
          </form>
        </> : <section className="practice-summary" aria-labelledby="vsimSummaryTitle">
          <h2 id="vsimSummaryTitle">이번 가상 종목</h2>
          <dl><div><dt>업종</dt><dd>{snapshot.company.industry}</dd></div><div><dt>종목</dt><dd>{snapshot.company.name}</dd></div><div><dt>{contest ? '판 시작 잔액' : '투자금'}</dt><dd>{money(snapshot.initialAmount)}</dd></div>
            {k > 1 && <div><dt>배율</dt><dd><LeverageBadge k={k} /></dd></div>}
            {snapshot.contest && <div><dt>대회 판</dt><dd>{BOARD_LABEL[snapshot.contest.board]} · {snapshot.contest.roundNumber}번째 판</dd></div>}
            {endBalance != null && <div><dt>새 대회 잔액</dt><dd><b>{money(endBalance)}</b></dd></div>}
          </dl>
          {/* 판 끝: 이번 판 매매 성과와 오늘 평균(서버 값). 대회 화면으로 돌아가지 않고 여기서 본다 */}
          {endBalance != null && holdBalance != null && holdReturnRate != null && excessRate != null && snapshot && <dl className="vsim-compare" aria-label="이번 판 매매 성과">
            <div><dt>내 판</dt><dd><b className={tone(snapshot.portfolio.returnRate)}>{percent(snapshot.portfolio.returnRate)}</b><small>{money(endBalance)}</small></dd></div>
            <div><dt><Term k="hold" /></dt><dd><b className={tone(holdReturnRate)}>{percent(holdReturnRate)}</b><small>{money(holdBalance)}</small></dd></div>
            <div className="vsim-compare-total"><dt><Term k="excess" label="이번 판 매매 성과" /></dt><dd><b className={tone(excessRate)}>{pp(excessRate)}</b></dd></div>
          </dl>}
          {finished && contest?.today && <div className="vsim-contest-today">
            <dl>
              <div><dt><Term k="today" /></dt><dd>{contest.today.returnRate == null ? '계산 중' : <b className={tone(contest.today.returnRate)}>{pp(contest.today.returnRate)}</b>}</dd></div>
              <div><dt>목표</dt><dd>{pp(contest.today.targetRate)} 이상</dd></div>
            </dl>
            <small>오늘 {contest.today.rounds}/{contest.roundsPerDay}판 · {contest.roundsPerDay}판을 모두 하고 목표 이상이면 +{contest.dayPoints}점, 못 미치면 −{contest.dayPoints}점이에요.</small>
          </div>}
          {leverageResult && <dl className="vsim-leverage-compare" aria-label="같은 기간 기초 종목과 레버리지 가격">
            <div><dt>기초 종목</dt><dd><b className={tone(leverageResult.underlyingReturnRate)}>{percent(leverageResult.underlyingReturnRate)}</b></dd></div>
            <div><dt>레버리지 {k}배 가격</dt><dd><b className={tone(leverageResult.leveragedReturnRate)}>{percent(leverageResult.leveragedReturnRate)}</b></dd></div>
            <div className="vsim-leverage-compare-mine"><dt>내 수익률</dt><dd><b className={tone(snapshot.portfolio.returnRate)}>{percent(snapshot.portfolio.returnRate)}</b></dd></div>
            <small>첫 거래일 시가 → 마지막 거래일 종가</small>
          </dl>}
          <p className="vsim-intro"><Written sample={sample} /> {snapshot.company.intro}</p>
          <p className="practice-muted">처음 50%로 주식을 사고 나머지는 현금으로 시작했어요.</p>
          {contest && !finished && <p className="practice-muted">그만두면 남은 사건은 유지로 보고 끝까지 계산해 잔액에 반영해요.</p>}
          {contest && finished && <button className="btn btn-primary practice-start" type="button" onClick={nextRound} disabled={busy || noRoundsLeft}>{noRoundsLeft ? '오늘 판을 모두 했어요' : '다음 판'}</button>}
          <button className="btn practice-start" type="button" onClick={reset}>{contest && finished ? '대회 화면으로' : restartLabel}</button>
        </section>}
        {contest ? <div className="practice-guide"><h3>대회 판은 이렇게 진행해요</h3><ol><li>가상 종목의 120거래일 구간을 재생하고, 가상 사건을 4번 만나요.</li><li>사건이 나오면 매수·매도·유지를 골라요.</li><li>채점은 없어요. 판이 끝난 총자산이 새 대회 잔액이에요.</li><li>사건마다 가만히 있었을 때보다 수익률이 그날 평균 {contest.today ? pp(contest.today.targetRate) : '목표'} 이상 높으면(매매 성과) {contest.roundsPerDay}판을 모두 했을 때 하루 점수 +{contest.dayPoints}점, 덜 했으면 0점이에요. 못 미치면 −{contest.dayPoints}점이에요.</li></ol></div>
          : <div className="practice-guide"><h3>이렇게 진행해요</h3><ol><li>가상 종목의 120~250거래일 구간을 재생하고, 가상 사건을 3번 이상 만나요.</li><li>사건과 사건 사이 시세가 {segmentSeconds(speed)}초 동안 지나가요.</li><li>사건이 나오면 방향과 거래를 선택해요.</li><li>채점은 없어요. 사건마다 공시 직후와 그다음 주 가상 등락, 그 유형 공시의 과거 통계를 보여 줘요.</li></ol><Link className="practice-guide-link" to="/simulation/guide">공시가 처음이면: 공시 읽는 법 ›</Link></div>}
      </aside>
      <main className="practice-market">
        <div className="practice-market-head"><div><span className="practice-muted">{snapshot ? snapshot.company.industry : '가상 시뮬레이션'}</span><h2>{snapshot?.company.name ?? '다음 장면은 아직 몰라요'}{snapshot && <> <Written sample={sample} /></>}{k > 1 && <> <LeverageBadge k={k} /></>}</h2></div><div className="practice-market-actions"><span className="practice-state">{finished ? '시뮬레이션 완료' : visibleEvent ? '사건 도착' : !snapshot ? '시작 전' : playing ? '재생 중' : '일시정지'}</span>{snapshot && !(contest && finished) && <button className={`btn btn-sm ${finished ? 'btn-primary' : ''}`} type="button" onClick={reset}>{restartLabel}</button>}</div></div>
        <div className="practice-quote">{snapshot ? <><strong>{money(candles.at(-1)!.close)}</strong><span>{candles.at(-1)!.date} {k > 1 ? `레버리지 ${k}배 가격 ` : ''}종가 · 가상 날짜</span></> : <p>가상 종목의 앞날은 한 번에 공개되지 않아요.<br />나의 판단을 먼저 남겨보세요.</p>}</div>
        {visibleEvent && collapsed && <div className="vsim-reopen" role="status"><p><b>{visibleEvent.categoryName} · 가상 사건</b> {visibleEvent.title}</p><button type="button" className="btn btn-sm btn-primary" onClick={expand}>선택 창 다시 열기</button></div>}
        <div ref={chartBox} className="practice-chart-box">
          {pinnedBand != null && decisions[pinnedBand - 1] && <div className="practice-pinned" role="status"><p><b>사건 {pinnedBand}</b> {decisions[pinnedBand - 1].title} · {decisions[pinnedBand - 1].date}{decisions[pinnedBand - 1].outcomeDate ? ` ~ ${decisions[pinnedBand - 1].outcomeDate}` : ''} 기간을 강조했어요.</p><span><button type="button" className="btn btn-sm" onClick={() => { const n = pinnedBand; scrollTo(articles.current[n]); articles.current[n]?.focus({ preventScroll: true }); }}>기록으로 돌아가기</button><button type="button" className="btn btn-sm" onClick={() => setPinnedBand(null)}>강조 끄기</button></span></div>}
          <CandleChart candles={candles} full={finished} bands={bands} activeBand={activeBand ?? pinnedBand} onActiveBand={setActiveBand} />
        </div>
        <div className="practice-playback"><div><b>{snapshot ? `${candles.length} / ${snapshot.totalDays} 거래일` : contest ? '120거래일의 가상 시장 여행' : '120~250거래일의 가상 시장 여행'}</b><span>{finished ? '모든 거래일을 확인했어요' : `사건 사이 구간을 ${segmentSeconds(speed)}초에 재생 · 사건이 나오면 자동으로 멈춰요`}</span></div><div className="practice-playback-controls"><PlaybackSpeed speed={speed} onChange={setSpeed} /><button ref={playButton} className="btn btn-sm" disabled={!snapshot || finished || !!visibleEvent || !!error} onClick={() => setPlaying(v => !v)}>{playing ? 'Ⅱ 일시정지' : '▶ 재생'}</button></div></div>
        <progress className="practice-progress" max={snapshot?.totalDays ?? 120} value={candles.length} aria-label="가상 시뮬레이션 진행" />
        {snapshot && <section className="practice-journal vsim-journal" ref={journal} tabIndex={-1} aria-labelledby="vsimJournalTitle"><div className="practice-section-title"><h2 id="vsimJournalTitle">{finished ? (contest ? '이번 판 돌아보기' : '이번 시뮬레이션 돌아보기') : '나의 선택 기록'}</h2><span>{`${decisions.length}개의 선택`}</span></div>
          {decisions.length > 0 && <p id="vsimJournalHint" className="practice-journal-hint">사건을 누르면 차트에서 그 기간을 다시 볼 수 있어요.</p>}
          {!decisions.length ? <p className="practice-muted">아직 만난 사건이 없어요. 차트를 따라가다 보면 선택의 순간이 찾아와요.</p> : decisions.map((r, i) => <article className={`practice-decision ${r.movement === 'UP' ? 'vsim-moved-up' : r.movement === 'DOWN' ? 'vsim-moved-down' : ''} ${(activeBand ?? pinnedBand) === i + 1 ? 'active' : ''} practice-clickable`} key={r.eventId} tabIndex={0} ref={el => { articles.current[i + 1] = el; }}
            aria-describedby="vsimJournalHint" aria-current={pinnedBand === i + 1 ? 'true' : undefined} onClick={() => showOnChart(i + 1)}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showOnChart(i + 1); } }}
            onMouseEnter={() => setActiveBand(i + 1)} onMouseLeave={() => setActiveBand(null)} onFocus={() => setActiveBand(i + 1)} onBlur={() => setActiveBand(null)}>
            <div className="practice-decision-meta"><span className="practice-decision-no"><span className="sr-only">사건 </span>{i + 1}</span><time>{r.date}<br />가상 날짜</time></div><div><h3>{r.title}</h3><p>{r.categoryName} · {r.action === 'HOLD' ? '유지' : `${r.action === 'BUY' ? '매수' : '매도'} ${fmt.format(r.quantity)}주 주문`}</p><small>{r.execution === 'PENDING' ? '다음 거래일 시가에 체결 예정' : r.execution === 'NO_FILL' ? '거래 가능한 수량이 1주 미만이라 체결하지 않았어요' : r.execution === 'HOLD' ? '보유 상태 유지' : `${r.executedDate} · ${r.executedShares}주 · 주당 ${money(r.executedPrice!)}`}</small></div><div className="practice-outcome">{contest ? <Moved r={r} sample={sample} /> : <Judged r={r} sample={sample} k={k} />}</div></article>)}
          {finished && contest && <p className="practice-result-note">대회 판은 채점하지 않아요. 판이 끝난 총자산이 새 대회 잔액이고, 가만히 있었을 때와의 차이(매매 성과)가 하루 점수의 기준이에요.</p>}
          {leverageResult && <div className="vsim-leverage-result" role="note"><LeverageBadge k={k} /><p>같은 기간 기초 종목은 {signed(leverageResult.underlyingReturnRate)}, 레버리지 {k}배 가격은 {signed(leverageResult.leveragedReturnRate)}였어요. 차이는 매일 배율을 다시 맞추는 구조 때문이에요. 실제 레버리지 ETF는 운용보수·추적 오차 등으로 이 계산과 다를 수 있어요.</p><p className="practice-muted">사건마다 보이는 공시 직후·그다음 주 등락과 유형 통계는 기초 종목 기준이고, 레버리지 {k}배 등락을 함께 보여 줘요. 내 손익·수익률은 레버리지 가격으로 계산했어요.</p></div>}
          {finished && !contest && <p className="practice-result-note">{sample ? '사건 날과 그 뒤 5거래일 움직임은 학습용 예시 통계에서 무작위로 뽑아요. 사건 글에는 좋고 나쁨을 담지 않았어요.' : '사건 날과 그 뒤 5거래일 움직임은 같은 유형 실제 공시 당일과 그 뒤의 움직임에서 무작위로 뽑아요. 시장 전체가 오르내린 몫은 빼지 않았어요. 사건 글에는 좋고 나쁨을 담지 않았어요.'} 채점은 없고, 수익률과 사건마다 공시 직후·그다음 주 가상 등락을 보여 줘요. 그다음 주는 다음 날 종가에 샀다고 가정한 비교라, 다음 날 시가에 체결된 내 매매의 수익률과는 다를 수 있어요.</p>}
        </section>}
      </main>
      <aside className="practice-wallet"><h2>{finished ? '최종 자산' : '나의 자산'}</h2><span className="practice-muted">현금 + 주식 평가액</span><strong className="practice-total">{portfolio ? money(portfolio.total) : '—'}</strong><div className={`practice-profit ${tone(portfolio?.profit ?? 0)}`}>{portfolio ? `${portfolio.profit > 0 ? '+' : ''}${money(portfolio.profit)} (${percent(portfolio.returnRate)})` : '시뮬레이션을 시작하면 표시돼요'}</div><dl><div><dt>{contest ? '판 시작 잔액' : '처음 넣은 돈'}</dt><dd>{snapshot ? money(snapshot.initialAmount) : '—'}</dd></div><div><dt>사용 가능한 현금</dt><dd>{portfolio ? money(portfolio.cash) : '—'}</dd></div><div><dt>주식 평가액</dt><dd>{portfolio ? money(portfolio.stockValue) : '—'}</dd></div><div><dt>보유 수량</dt><dd>{portfolio ? `${fmt.format(portfolio.shares)}주` : '—'}</dd></div><AveragePriceRows averagePrice={portfolio?.averagePrice} close={candles.at(-1)?.close} /></dl>{portfolio && portfolio.shares === 0 && <p className="practice-muted">현재는 주식을 보유하지 않고 현금으로 기다리고 있어요.</p>}<p className="practice-wallet-note">매수·매도는 선택 다음 거래일의 시가로 계산해요. 배당·세금·수수료는 포함하지 않아요.</p></aside>
    </div>
    <footer className="practice-footnote">{snapshot?.notice ?? '가상 종목·가상 사건으로 연습하는 가상 투자예요. 미래 수익을 보장하거나 투자를 권유하지 않아요.'}{snapshot && <p>자료: {snapshot.sources.join(' · ')}{snapshot.ruleset.dataFrom && snapshot.ruleset.dataTo ? ` · 통계 기간 ${snapshot.ruleset.dataFrom}~${snapshot.ruleset.dataTo}` : ''}</p>}</footer>
    <dialog ref={dialog} className="practice-modal vsim-modal" onCancel={e => e.preventDefault()} aria-labelledby="vsimEventTitle">
      {visibleEvent && portfolio && <form onSubmit={choose}>
        <div className="practice-modal-top"><span>{visibleEvent.categoryName} · 가상 사건</span><span className="vsim-modal-tools"><time>{visibleEvent.date} · 가상 날짜</time><button type="button" className="vsim-collapse" onClick={collapse} aria-label="선택 창 접고 차트 보기">접기 ▾</button></span></div>
        <h2 id="vsimEventTitle" className="vsim-title">{visibleEvent.title}</h2>
        <WrittenNotice sample={sample} />
        <p className="vsim-body">{visibleEvent.body}</p>
        <fieldset disabled={busy}>
          <legend>나는 어떤 선택을 할까요?</legend>
          <div className="vsim-trade-row">
            <button type="button" className={`vsim-buy ${action === 'BUY' ? 'selected' : ''}`} aria-pressed={action === 'BUY'} onClick={() => { setAction('BUY'); setQuantity(''); }} disabled={!limits?.maxBuyShares}>매수</button>
            <button type="button" className={`vsim-sell ${action === 'SELL' ? 'selected' : ''}`} aria-pressed={action === 'SELL'} onClick={() => { setAction('SELL'); setQuantity(''); }} disabled={!limits?.maxSellShares}>매도</button>
            <button type="button" className={`vsim-hold ${action === 'HOLD' ? 'selected' : ''}`} aria-pressed={action === 'HOLD'} onClick={() => { setAction('HOLD'); setQuantity(''); }}>유지</button>
          </div>
          <dl className="vsim-holding" aria-live="polite">
            <div><dt>보유 주식</dt><dd>{fmt.format(portfolio.shares)}주{after && <> → <b>{fmt.format(after.shares)}주</b></>}</dd></div>
            <div><dt>평가 금액</dt><dd>{money(portfolio.stockValue)}{after && limits && <> → <b>{money(after.shares * limits.referencePrice)}</b></>}</dd></div>
            <div><dt>사용 가능한 현금</dt><dd>{money(portfolio.cash)}{after && <> → <b>{money(after.cash)}</b></>}</dd></div>
          </dl>
          {action && action !== 'HOLD' && limits && <div className="vsim-order">
            <label htmlFor="vsimQuantity">{action === 'BUY' ? '매수할 수량' : '매도할 수량'}</label>
            <div className="vsim-order-input"><input id="vsimQuantity" type="text" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''))} maxLength={9} aria-describedby="vsimQuantityHelp" aria-invalid={!!quantity && !orderValid} placeholder="0" /><span>주</span><button type="button" onClick={() => setQuantity(String(orderMax))}>최대</button></div>
            <div id="vsimQuantityHelp" className="vsim-order-limits">
              <div><span>{action === 'BUY' ? '최대 매수 가능' : '최대 매도 가능'}</span><b>{fmt.format(orderMax)}주</b></div>
              <div><span>기준 가격(지금 종가)</span><b>{money(limits.referencePrice)}</b></div>
            </div>
            {quantity && !orderValid && <p role="alert" className="practice-rise">1주부터 {fmt.format(orderMax)}주까지 입력해 주세요.</p>}
            <div className="vsim-order-total"><span>{action === 'BUY' ? '예상 매수 금액' : '예상 매도 금액'}</span><b>{money(orderAmount)}</b></div>
            <small>추정 금액이에요. 실제 체결은 다음 거래일 시가로 하고, 매수는 그 가격에 살 수 있는 만큼만 체결해요.</small>
          </div>}
        </fieldset>
        {error && <p role="alert" className="practice-rise">{error}</p>}
        <button className="btn btn-primary practice-start" type="submit" disabled={!action || !orderValid || busy || !!pending.current}>{busy ? '선택 반영 중…' : '선택하고 계속하기'}</button>
        {error && pending.current && <button type="button" className="btn practice-start" onClick={retry} disabled={busy}>같은 선택 다시 보내기</button>}
        <button type="button" className="practice-modal-end" onClick={reset} disabled={busy}>{contest ? '판 그만하기(남은 사건은 유지로 계산)' : '시뮬레이션 종료'}</button>
      </form>}
    </dialog>
  </>;
}
