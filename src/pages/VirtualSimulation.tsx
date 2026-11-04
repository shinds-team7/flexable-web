import { useCallback, useEffect, useRef, useState } from 'react';
import { CandleChart, type EventBand } from '@/charts/CandleChart';
import { Icon } from '@/components/Icons';
import { getVirtualSimStatus, virtualSim, type VirtualSimDecision, type VirtualSimSnapshot, type VirtualSimStarted, type VirtualSimStatus } from '@/data/virtualSim';
import { ApiError, errorText } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/motion';

// 가상 시뮬레이션(decisions/2026-11-04-virtual-simulation 6). 흐름·재생·모달은 과거 시장 연습과 같고, 숫자는 모두 서버 응답을 그대로 보인다.
// 고지 문구는 응답의 isSample로 고른다(예시 세션은 AI·실제 시장 통계 문구를 쓰지 않는다).
const fmt = new Intl.NumberFormat('ko-KR');
const money = (n: number) => `${fmt.format(n)}원`;
const percent = (n: number) => `${n > 0 ? '▲ ' : n < 0 ? '▼ ' : ''}${Math.abs(n * 100).toFixed(2)}%`;
const tone = (n: number) => n > 0 ? 'practice-rise' : n < 0 ? 'practice-fall' : '';
/** 0.6676 → 66.7(보여 주기만, 내림) */
const share = (n: number) => (Math.floor(n * 1000) / 10).toFixed(1);
const SEGMENT_MS = 3000;
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

/** 판정 뒤 근거·경향 채점·이번 결과 */
function Judged({ r, sample }: { r: VirtualSimDecision; sample: boolean }) {
  if (!r.outcome || r.categoryUpShare == null || r.categorySampleCount == null || !r.trend || !r.trendOutcome) return <small>5거래일 뒤 확인해요</small>;
  const moved = r.movement === 'UP' ? 1 : r.movement === 'DOWN' ? -1 : 0;
  const against = (r.trend === 'UP' && moved < 0) || (r.trend === 'DOWN' && moved > 0);
  const opposite = r.trend === 'UP' ? 1 - r.categoryUpShare : r.categoryUpShare;
  const n = fmt.format(r.categorySampleCount);
  return <div className="vsim-judged">
    <p><b>과거 경향</b> {r.trendOutcome === 'CORRECT' ? '과거 경향을 맞혔어요.' : r.trendOutcome === 'INCORRECT' ? '과거 경향과 달랐어요.' : r.action === 'HOLD' ? '유지를 골라 채점하지 않아요.' : '이 공시만으로는 방향을 알기 어려운 유형이에요. 채점하지 않아요.'}</p>
    <p className="practice-muted">{sample ? `예시 통계에서 ${r.categoryName} ${n}건 중 ${share(r.categoryUpShare)}%가 5거래일 뒤 올랐어요.` : `과거 ${r.categoryName} 공시 ${n}건 중 ${share(r.categoryUpShare)}%가 5거래일 뒤 올랐어요.`}</p>
    <p><b>이후 5거래일 가상 등락</b> 이번에는 5거래일 뒤 {moved > 0 ? '올랐어요' : moved < 0 ? '내렸어요' : '그대로였어요'}. <span className={tone(r.subsequentReturnRate ?? 0)}>{percent(r.subsequentReturnRate ?? 0)}</span>{against && <> 이 유형도 {share(opposite)}%는 반대로 움직였어요.</>}</p>
  </div>;
}

export function VirtualSimulation({ active, onGoPast }: { active: boolean; onGoPast: () => void }) {
  const [status, setStatus] = useState<VirtualSimStatus | null>(null);
  const [amount, setAmount] = useState('1000000');
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
  // 끝나면 "이번 시뮬레이션 돌아보기"로 내려 결과를 바로 보이게 한다
  const journal = useRef<HTMLElement>(null);

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
  useEffect(() => {
    setAction(null); setQuantity(''); setCollapsed(false);
    if (visibleEvent) { setPlaying(false); dialog.current?.showModal(); }
    else { dialog.current?.close(); playButton.current?.focus({ preventScroll: true }); }
  }, [visibleEvent?.id]);

  const send = useCallback(async (request: Pending) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); pending.current = request;
    const current = generation.current;
    try {
      const result = await virtualSim<VirtualSimSnapshot | VirtualSimStarted>(request.path, request.body);
      if (current !== generation.current) {
        if ('sessionToken' in result) void virtualSim('end', { sessionToken: result.sessionToken }).catch(() => {});
        return;
      }
      const next = 'snapshot' in result ? result.snapshot : result;
      if ('sessionToken' in result) token.current = result.sessionToken;
      show(next); pending.current = null;
      if (request.path !== 'step' && activeRef.current) setPlaying(true);
    } catch (e) {
      if (current !== generation.current) return;
      setPlaying(false); setError(errorText(e));
      if (e instanceof ApiError && request.path === 'start' && e.status === 503 && e.code === 'PRACTICE_UNAVAILABLE') { pending.current = null; setError(''); setUnavailable(true); }
      if (e instanceof ApiError && e.status < 500) {
        pending.current = null;
        if (e.status === 410) { token.current = null; show(null); }
        if (e.status === 409 && token.current) {
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
    // 구간 전체가 3초에 끝나도록 경과 시간으로 그릴 봉 수를 정한다(일시정지하면 그 자리에서 이어서)
    const end = snapshot!.candles.length, gap = SEGMENT_MS / snapshot!.frames.length, from = shown, started = performance.now();
    let timer = 0;
    const tick = () => {
      const next = Math.min(end, from + Math.floor((performance.now() - started) / gap));
      setShown(next);
      if (next < end) timer = window.setTimeout(tick, Math.min(gap, 16));
    };
    timer = window.setTimeout(tick, Math.min(gap, 16));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 시작 위치만 필요하고 매 봉마다 다시 시작하지 않는다
  }, [playing, revealing, error, snapshot]);

  const reset = () => {
    generation.current++; setPlaying(false); show(null); setError(''); setBusy(false); inFlight.current = false; pending.current = null;
    setActiveBand(null); focusSetup.current = true;
    const old = token.current; token.current = null;
    if (old) void virtualSim('end', { sessionToken: old }).catch(() => {});
  };
  useEffect(() => {
    if (snapshot || !focusSetup.current) return;
    focusSetup.current = false;
    amountInput.current?.focus();
  }, [snapshot]);
  const collapse = () => { setCollapsed(true); dialog.current?.close(); };
  const expand = () => { setCollapsed(false); dialog.current?.showModal(); };
  const start = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 10000 || value > 100000000) { setError('투자금은 1만 원부터 1억 원까지 원 단위로 입력해 주세요.'); return; }
    void send({ path: 'start', body: { startId: crypto.randomUUID(), initialAmount: value } });
  };
  const choose = (event: React.FormEvent) => {
    event.preventDefault();
    if (!action || !snapshot?.event || revealing || !orderValid) return;
    void send({ path: 'decision', body: { sessionToken: token.current, commandId: crypto.randomUUID(), expectedVersion: snapshot.version,
      eventId: snapshot.event.id, action, quantity: action === 'HOLD' ? 0 : orderQty } });
  };

  // 마지막 봉까지 다 그린 뒤(구간 재생이 끝난 뒤) 한 번 내린다. 숨긴 탭에서는 내리지 않는다
  const done = !revealing && snapshot?.status === 'FINISHED';
  useEffect(() => {
    if (!done || !activeRef.current) return;
    journal.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [done]);

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
  const scored = decisions.filter(r => r.trendOutcome === 'CORRECT' || r.trendOutcome === 'INCORRECT');
  const correct = scored.filter(r => r.trendOutcome === 'CORRECT').length;
  const restartLabel = finished ? '다른 가상 종목으로 다시 하기' : '시뮬레이션 종료하고 다시 설정';
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
    <div className="practice-workspace">
      <aside className="practice-setup">
        {!snapshot ? <>
          <div className="practice-setup-title"><h2>어떤 가상 종목을 만날까요?</h2></div>
          <p className="practice-muted">시작하면 가상 종목 하나를 무작위로 받아요. 날짜는 지금부터 10년 뒤의 가상 날짜예요.</p>
          <form onSubmit={start}>
            <fieldset disabled={busy || !status}>
              <div className="practice-amount-label"><label htmlFor="vsimAmount">연습할 투자금</label><small id="vsimAmountHelp">1만 원 ~ 1억 원</small></div>
              <div className="practice-amount"><input ref={amountInput} id="vsimAmount" type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} maxLength={9} aria-describedby="vsimAmountHelp" /><span>원</span></div>
              <div className="practice-amount-presets">{[1000000, 5000000, 10000000].map(n => <button key={n} type="button" onClick={() => setAmount(String(n))}>{fmt.format(n / 10000)}만</button>)}</div>
            </fieldset>
            <button className="btn btn-primary practice-start" type="submit" disabled={busy || !status}>{!status ? '불러오는 중…' : busy ? '시뮬레이션 준비 중…' : '가상 시뮬레이션 시작'}</button>
            <p className="practice-allocation">처음에는 투자금의 50%로 주식을 사고, 나머지는 추가 매수를 위한 현금으로 남겨요.</p>
          </form>
        </> : <section className="practice-summary" aria-labelledby="vsimSummaryTitle">
          <h2 id="vsimSummaryTitle">이번 가상 종목</h2>
          <dl><div><dt>업종</dt><dd>{snapshot.company.industry}</dd></div><div><dt>종목</dt><dd>{snapshot.company.name}</dd></div><div><dt>투자금</dt><dd>{money(snapshot.initialAmount)}</dd></div></dl>
          <p className="vsim-intro"><Written sample={sample} /> {snapshot.company.intro}</p>
          <p className="practice-muted">처음 50%로 주식을 사고 나머지는 현금으로 시작했어요.</p>
          <button className="btn practice-start" type="button" onClick={reset}>{restartLabel}</button>
        </section>}
        <div className="practice-guide"><h3>이렇게 진행해요</h3><ol><li>가상 종목의 120~250거래일 구간을 재생하고, 가상 사건을 3번 이상 만나요.</li><li>사건과 사건 사이 시세가 3초 동안 지나가요.</li><li>사건이 나오면 방향과 거래를 선택해요.</li><li>그 유형 공시의 과거 경향으로 채점하고, 이번 5거래일 가상 등락도 함께 보여 줘요.</li></ol></div>
      </aside>
      <main className="practice-market">
        <div className="practice-market-head"><div><span className="practice-muted">{snapshot ? snapshot.company.industry : '가상 시뮬레이션'}</span><h2>{snapshot?.company.name ?? '다음 장면은 아직 몰라요'}{snapshot && <> <Written sample={sample} /></>}</h2></div><div className="practice-market-actions"><span className="practice-state">{finished ? '시뮬레이션 완료' : visibleEvent ? '사건 도착' : !snapshot ? '시작 전' : playing ? '재생 중' : '일시정지'}</span>{snapshot && <button className={`btn btn-sm ${finished ? 'btn-primary' : ''}`} type="button" onClick={reset}>{restartLabel}</button>}</div></div>
        <div className="practice-quote">{snapshot ? <><strong>{money(candles.at(-1)!.close)}</strong><span>{candles.at(-1)!.date} 종가 · 가상 날짜</span></> : <p>가상 종목의 앞날은 한 번에 공개되지 않아요.<br />나의 판단을 먼저 남겨보세요.</p>}</div>
        {visibleEvent && collapsed && <div className="vsim-reopen" role="status"><p><b>{visibleEvent.categoryName} · 가상 사건</b> {visibleEvent.title}</p><button type="button" className="btn btn-sm btn-primary" onClick={expand}>선택 창 다시 열기</button></div>}
        <CandleChart candles={candles} full={finished} bands={bands} activeBand={activeBand} onActiveBand={setActiveBand} />
        <div className="practice-playback"><div><b>{snapshot ? `${candles.length} / ${snapshot.totalDays} 거래일` : '120~250거래일의 가상 시장 여행'}</b><span>{finished ? '모든 거래일을 확인했어요' : '사건 사이 구간을 3초에 재생 · 사건이 나오면 자동으로 멈춰요'}</span></div><button ref={playButton} className="btn btn-sm" disabled={!snapshot || finished || !!visibleEvent || !!error} onClick={() => setPlaying(v => !v)}>{playing ? 'Ⅱ 일시정지' : '▶ 재생'}</button></div>
        <progress className="practice-progress" max={snapshot?.totalDays ?? 120} value={candles.length} aria-label="가상 시뮬레이션 진행" />
        {snapshot && <section className="practice-journal vsim-journal" ref={journal} tabIndex={-1} aria-labelledby="vsimJournalTitle"><div className="practice-section-title"><h2 id="vsimJournalTitle">{finished ? '이번 시뮬레이션 돌아보기' : '나의 선택 기록'}</h2><span>{finished && scored.length ? `과거 경향 ${correct} / ${scored.length} 맞힘` : `${decisions.length}개의 선택`}</span></div>
          {!decisions.length ? <p className="practice-muted">아직 만난 사건이 없어요. 차트를 따라가다 보면 선택의 순간이 찾아와요.</p> : decisions.map((r, i) => <article className={`practice-decision ${r.movement === 'UP' ? 'vsim-moved-up' : r.movement === 'DOWN' ? 'vsim-moved-down' : ''} ${activeBand === i + 1 ? 'active' : ''}`} key={r.eventId} tabIndex={0}
            onMouseEnter={() => setActiveBand(i + 1)} onMouseLeave={() => setActiveBand(null)} onFocus={() => setActiveBand(i + 1)} onBlur={() => setActiveBand(null)}>
            <div className="practice-decision-meta"><span className="practice-decision-no"><span className="sr-only">사건 </span>{i + 1}</span><time>{r.date}<br />가상 날짜</time></div><div><h3>{r.title}</h3><p>{r.categoryName} · {r.action === 'HOLD' ? '유지' : `${r.action === 'BUY' ? '매수' : '매도'} ${fmt.format(r.quantity)}주 주문`}</p><small>{r.execution === 'PENDING' ? '다음 거래일 시가에 체결 예정' : r.execution === 'NO_FILL' ? '거래 가능한 수량이 1주 미만이라 체결하지 않았어요' : r.execution === 'HOLD' ? '보유 상태 유지' : `${r.executedDate} · ${r.executedShares}주 · 주당 ${money(r.executedPrice!)}`}</small></div><div className="practice-outcome"><Judged r={r} sample={sample} /></div></article>)}
          {finished && <p className="practice-result-note">{sample ? '사건 뒤 움직임은 학습용 예시 통계에서 무작위로 뽑아요. 사건 글에는 좋고 나쁨을 담지 않았어요.' : '사건 뒤 움직임은 같은 유형 실제 공시 뒤의 움직임에서 무작위로 뽑아요. 사건 글에는 좋고 나쁨을 담지 않았어요.'} 점수는 과거 경향을 맞힌 수이고, 매수·매도 선택은 채점하지 않아요.</p>}
        </section>}
      </main>
      <aside className="practice-wallet"><h2>{finished ? '최종 자산' : '나의 자산'}</h2><span className="practice-muted">현금 + 주식 평가액</span><strong className="practice-total">{portfolio ? money(portfolio.total) : '—'}</strong><div className={`practice-profit ${tone(portfolio?.profit ?? 0)}`}>{portfolio ? `${portfolio.profit > 0 ? '+' : ''}${money(portfolio.profit)} (${percent(portfolio.returnRate)})` : '시뮬레이션을 시작하면 표시돼요'}</div><dl><div><dt>처음 넣은 돈</dt><dd>{snapshot ? money(snapshot.initialAmount) : '—'}</dd></div><div><dt>사용 가능한 현금</dt><dd>{portfolio ? money(portfolio.cash) : '—'}</dd></div><div><dt>주식 평가액</dt><dd>{portfolio ? money(portfolio.stockValue) : '—'}</dd></div><div><dt>보유 수량</dt><dd>{portfolio ? `${fmt.format(portfolio.shares)}주` : '—'}</dd></div></dl>{portfolio && portfolio.shares === 0 && <p className="practice-muted">현재는 주식을 보유하지 않고 현금으로 기다리고 있어요.</p>}<p className="practice-wallet-note">매수·매도는 선택 다음 거래일의 시가로 계산해요. 배당·세금·수수료는 포함하지 않아요.</p></aside>
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
        <button type="button" className="practice-modal-end" onClick={reset} disabled={busy}>시뮬레이션 종료</button>
      </form>}
    </dialog>
  </>;
}
