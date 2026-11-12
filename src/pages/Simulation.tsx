import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CandleChart, type EventBand } from '@/charts/CandleChart';
import { AveragePriceRows } from '@/components/AveragePrice';
import { PlaybackSpeed, segmentMs, segmentSeconds, type Speed } from '@/components/PlaybackSpeed';
import { getCategories, practice, type CategoryResponse, type PracticeSnapshot, type Started } from '@/data/practice';
import { ApiError, errorText } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/motion';
import { VirtualContest } from '@/pages/VirtualContest';
import { VirtualSimulation } from '@/pages/VirtualSimulation';
import '@/styles/practice.css';

const fmt = new Intl.NumberFormat('ko-KR');
const money = (n: number) => `${fmt.format(n)}원`;
const percent = (n: number) => `${n > 0 ? '▲ ' : n < 0 ? '▼ ' : ''}${Math.abs(n * 100).toFixed(2)}%`;
const tone = (n: number) => n > 0 ? 'practice-rise' : n < 0 ? 'practice-fall' : '';
type Reveal = { from: number; prev: PracticeSnapshot };
type Pending = { path: 'start' | 'step' | 'decision'; body: unknown };

// 과거 시장 연습. 탭을 옮겨도 진행을 잃지 않도록 숨겨 둔 채 유지하고, 숨겨지면 재생만 멈춘다
function PastMarketPractice({ active }: { active: boolean }) {
  const [catalog, setCatalog] = useState<CategoryResponse | null>(null);
  // 고른 업종과 종목(stock이 null이면 그 업종 안에서 무작위로 받기). 처음에는 아무것도 고르지 않는다
  const [pick, setPick] = useState<{ category: string; stock: string | null } | null>(null);
  // 펼친 업종(한 번에 하나)
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState('1000000');
  const [snapshot, setSnapshot] = useState<PracticeSnapshot | null>(null);
  // 진행 응답으로 받은 구간을 하루씩 그리는 중이면 그 직전 상태와 지금까지 보여 준 봉 수
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prediction, setPrediction] = useState<'POSITIVE' | 'NEGATIVE' | null>(null);
  const [action, setAction] = useState<'BUY' | 'SELL' | 'HOLD' | null>(null);
  const [allocation, setAllocation] = useState(50);
  const token = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const latest = useRef<PracticeSnapshot | null>(null);
  const setup = useRef<HTMLElement>(null);
  // 다시 설정으로 돌아오면 고른 종목에 포커스를 둔다(키보드로 바로 다른 종목을 고를 수 있게)
  const focusSetup = useRef(false);
  // 선택 기록과 차트 사건 기간 띠를 같은 번호로 함께 강조한다
  const [activeBand, setActiveBand] = useState<number | null>(null);
  // 기록에서 누른 사건: 차트로 올라가 그 사건 기간 띠를 계속 강조한다(마우스를 떼도 남는다)
  const [pinnedBand, setPinnedBand] = useState<number | null>(null);
  const chartBox = useRef<HTMLDivElement>(null);
  const articles = useRef<Record<number, HTMLElement | null>>({});
  // 재생 속도(저장하지 않는다). 바꾸면 남은 봉부터 새 간격으로 그린다
  const [speed, setSpeed] = useState<Speed>(1);

  const loadCategories = useCallback(async () => {
    const current = generation.current;
    try { const data = await getCategories(); if (current === generation.current) { setCatalog(data); setOpen(o => o ?? data.categories[0]?.code ?? null); setError(''); } }
    catch (e) { if (current === generation.current) setError(errorText(e)); }
  }, []);
  useEffect(() => { void loadCategories(); return () => {
    generation.current++;
    const existing = token.current; token.current = null;
    if (existing) void practice('end', { sessionToken: existing }).catch(() => {});
  }; }, [loadCategories]);
  // 응답이 늦게 와도 숨겨진 탭에서는 재생을 다시 켜지 않도록 지금 보이는지를 ref로 본다
  const activeRef = useRef(active); activeRef.current = active;
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const show = useCallback((next: PracticeSnapshot | null) => {
    const prev = latest.current; latest.current = next; setSnapshot(next);
    if (next && prev && next.frames.length) { setReveal({ from: prev.candles.length, prev }); setShown(prev.candles.length); }
    else { setReveal(null); setShown(next?.candles.length ?? 0); }
  }, []);
  const revealing = !!reveal && !!snapshot && shown < snapshot.candles.length;
  const visibleEvent = revealing ? null : snapshot?.event ?? null;
  // 숨겨진 탭에 열린 모달이 남으면 top layer에서 페이지를 막으니, 보이는 동안만 연다
  const modalOpen = active && !!visibleEvent;
  useEffect(() => {
    const d = dialog.current;
    if (modalOpen && !d?.open) d?.showModal();
    else if (!modalOpen && d?.open) d.close();
  }, [modalOpen]);
  useEffect(() => {
    setPrediction(null); setAction(null); setAllocation(50);
    if (visibleEvent) setPlaying(false);
    else playButton.current?.focus({ preventScroll: true });
  }, [visibleEvent?.id]);

  const send = useCallback(async (request: Pending) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); pending.current = request;
    const current = generation.current;
    try {
      const result = await practice<PracticeSnapshot | Started>(request.path, request.body);
      if (current !== generation.current) {
        if ('sessionToken' in result) void practice('end', { sessionToken: result.sessionToken }).catch(() => {});
        return;
      }
      const next = 'snapshot' in result ? result.snapshot : result;
      if ('sessionToken' in result) token.current = result.sessionToken;
      show(next); pending.current = null;
      if (request.path !== 'step' && activeRef.current) setPlaying(true);
    } catch (e) {
      if (current !== generation.current) return;
      setPlaying(false); setError(errorText(e));
      if (e instanceof ApiError && e.status < 500) {
        pending.current = null;
        if (e.status === 410) { token.current = null; show(null); }
        if (e.status === 409 && token.current) {
          try { const latest = await practice<PracticeSnapshot>('state', { sessionToken: token.current }); if (current === generation.current) show(latest); }
          catch { setError('현재 상태를 확인하지 못했어요. 새 연습을 시작해 주세요.'); }
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
    // 렌더링이 늦어도 구간 전체가 고른 속도의 시간(1배 3초)에 끝나도록 타이머 횟수가 아니라 경과 시간으로 그릴 봉 수를 정한다
    // (일시정지하거나 속도를 바꾸면 그 자리에서 이어서)
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
    setActiveBand(null); setPinnedBand(null); focusSetup.current = true;
    if (pick) setOpen(pick.category);
    const old = token.current; token.current = null;
    if (old) void practice('end', { sessionToken: old }).catch(() => {});
  };
  useEffect(() => {
    if (snapshot || !focusSetup.current) return;
    focusSetup.current = false;
    setup.current?.querySelector<HTMLInputElement>('input[name="practiceStock"]:checked')?.focus();
  }, [snapshot]);
  const start = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 10000 || value > 100000000) { setError('투자금은 1만 원부터 1억 원까지 원 단위로 입력해 주세요.'); return; }
    if (!pick) return;
    void send({ path: 'start', body: { startId: crypto.randomUUID(), categoryCode: pick.category, ...(pick.stock ? { stockCode: pick.stock } : {}), initialAmount: value } });
  };
  const choose = (event: React.FormEvent) => {
    event.preventDefault();
    if (!prediction || !action || !snapshot?.event || revealing) return;
    void send({ path: 'decision', body: { sessionToken: token.current, commandId: crypto.randomUUID(), expectedVersion: snapshot.version,
      eventId: snapshot.event.id, prediction, action, allocationPercent: action === 'HOLD' ? 0 : allocation } });
  };
  const scrollTo = (el: HTMLElement | null | undefined) => el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  /** 기록의 사건을 누르면 차트로 올라가 그 기간을 강조한다. 같은 사건을 다시 누르면 강조를 끈다 */
  const showOnChart = (n: number) => {
    if (pinnedBand === n) { setPinnedBand(null); return; }
    setPinnedBand(n); scrollTo(chartBox.current);
  };
  const isSample = snapshot?.isSample ?? catalog?.isSample;
  // 구간을 그리는 동안에는 그날까지의 봉·자산만 보이고, 구간 안에서 확정된 판정은 다 그린 뒤 보인다
  const candles = snapshot ? snapshot.candles.slice(0, shown) : [];
  const portfolio = revealing ? (snapshot!.frames[shown - reveal!.from - 1]?.portfolio ?? reveal!.prev.portfolio) : snapshot?.portfolio;
  const decisions = revealing ? reveal!.prev.decisions : snapshot?.decisions ?? [];
  const finished = !revealing && snapshot?.status === 'FINISHED';
  // 진행 중에는 공개된 봉까지만 그리므로 판정 전 사건의 띠는 오늘 봉에서 끝난다
  const bands: EventBand[] = decisions.map((r, i) => ({ n: i + 1, from: r.baselineDate, to: r.outcomeDate }));
  const restartLabel = finished ? '다른 종목으로 다시 연습' : '연습 종료하고 다시 설정';
  const retry = () => { if (pending.current) void send(pending.current); else if (!catalog) void loadCategories(); else setError(''); };
  return <>
    <div className="practice-notice"><span>{isSample ? '예시 모드' : '과거 시장 연습'}</span><p>{isSample ? '학습용으로 만든 가상 기업·시세·사건이에요. 실제 기업의 투자 결과가 아니에요.' : '과거 시세를 따라가는 가상 투자예요. 실제 주문이나 계좌 연결은 이루어지지 않아요.'}</p></div>
    {error && <div className="practice-error" role="alert"><p>{error}</p><button className="btn btn-sm" onClick={retry} disabled={busy}>다시 시도</button></div>}
    <div className="practice-workspace">
      <aside className="practice-setup" ref={setup}>
        {!snapshot ? <>
          <div className="practice-setup-title"><h2>어떤 종목을 만나볼까요?</h2>{catalog && catalog.categories.length > 0 && <span>업종 {catalog.categories.length}개</span>}</div>
          <form onSubmit={start}>
            <fieldset disabled={busy}><legend className="sr-only">회사 카테고리</legend>
              {!catalog ? <p role="status">업종을 불러오고 있어요…</p> : catalog.categories.length === 0 ? <p>시세와 사건 자료를 준비하고 있어요. 잠시 후 다시 확인해 주세요.</p> : <div className="practice-category-list">{catalog.categories.map(c => {
                // 업종을 누르면 펼쳐지고, 펼친 업종 아래에서 종목(또는 무작위로 받기)을 고른다. 고른 것은 접어도 남는다
                const expanded = open === c.code, chosen = pick?.category === c.code ? pick : null;
                const chosenName = chosen && (chosen.stock ? c.stocks.find(s => s.code === chosen.stock)?.name : '무작위로 받기');
                return <div className={`practice-category-group ${expanded ? 'open' : ''}`} key={c.code}>
                  <button type="button" className={`practice-category ${chosen ? 'selected' : ''}`} aria-expanded={expanded} aria-controls={`practice-stocks-${c.code}`} onClick={() => setOpen(expanded ? null : c.code)}>
                    <span><b>{c.name}</b><small>{chosenName ? `선택: ${chosenName}` : `${c.eligibleCount}개 종목`}</small></span><span className="practice-category-check" aria-hidden="true">{expanded ? '▴' : '▾'}</span>
                  </button>
                  {expanded && <div className="practice-stock-list" id={`practice-stocks-${c.code}`} role="radiogroup" aria-label={`${c.name} 종목`}>
                    {[{ code: null, name: '무작위로 받기', note: `${c.eligibleCount}개 중 하나` }, ...c.stocks.map(s => ({ code: s.code as string | null, name: s.name, note: s.code }))].map(s => {
                      const checked = chosen?.stock === s.code;
                      return <label className={`practice-stock ${checked ? 'selected' : ''} ${s.code ? '' : 'random'}`} key={s.code ?? '*'}>
                        <input type="radio" name="practiceStock" value={s.code ?? ''} checked={checked} onChange={() => setPick({ category: c.code, stock: s.code })} /><span>{s.name}</span><small>{s.note}</small><span className="practice-category-check" aria-hidden="true">{checked ? '●' : '○'}</span>
                      </label>;
                    })}
                  </div>}
                </div>;
              })}</div>}
              <div className="practice-amount-label"><label htmlFor="practiceAmount">연습할 투자금</label><small id="practiceAmountHelp">1만 원 ~ 1억 원</small></div>
              <div className="practice-amount"><input id="practiceAmount" type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} maxLength={9} aria-describedby="practiceAmountHelp" /><span>원</span></div>
              <div className="practice-amount-presets">{[1000000, 5000000, 10000000].map(n => <button key={n} type="button" onClick={() => setAmount(String(n))}>{fmt.format(n / 10000)}만</button>)}</div>
            </fieldset>
            <button className="btn btn-primary practice-start" type="submit" disabled={busy || !pick || !catalog?.categories.length}>{busy ? '연습 준비 중…' : '시뮬레이션 시작'}</button>
            <p className="practice-allocation">처음에는 투자금의 50%로 주식을 사고, 나머지는 추가 매수를 위한 현금으로 남겨요.</p>
          </form>
        </> : <section className="practice-summary" aria-labelledby="practiceSummaryTitle">
          {/* 설정 폼 밖에 두는 버튼이라 눌렀을 때 폼 제출(새 시작)로 이어지지 않는다 */}
          <h2 id="practiceSummaryTitle">이번 연습</h2>
          <dl><div><dt>업종</dt><dd>{snapshot.instrument.categoryName}</dd></div><div><dt>종목</dt><dd>{snapshot.instrument.name}</dd></div><div><dt>투자금</dt><dd>{money(snapshot.initialAmount)}</dd></div></dl>
          <p className="practice-muted">처음 50%로 주식을 사고 나머지는 현금으로 시작했어요.</p>
          <button className="btn practice-start" type="button" onClick={reset}>{restartLabel}</button>
        </section>}
        <div className="practice-guide"><h3>이렇게 진행해요</h3><ol><li>종목마다 공시 문제를 3개 이상 만나는 120거래일 이상 구간을 재생해요.</li><li>사건과 사건 사이 시세가 {segmentSeconds(speed)}초 동안 지나가요.</li><li>사건이 나오면 방향과 거래를 선택해요.</li><li>이후 5거래일의 움직임을 확인해요.</li></ol><Link className="practice-guide-link" to="/simulation/guide">공시가 처음이면: 공시 읽는 법 ›</Link></div>
      </aside>
      <main className="practice-market">
        <div className="practice-market-head"><div><span className="practice-muted">{snapshot ? snapshot.instrument.categoryName : '나의 투자 연습'}</span><h2>{snapshot?.instrument.name ?? '다음 장면은 아직 몰라요'}</h2></div><div className="practice-market-actions"><span className="practice-state">{finished ? '연습 완료' : visibleEvent ? '사건 도착' : !snapshot ? '시작 전' : playing ? '재생 중' : '일시정지'}</span>{snapshot && <button className={`btn btn-sm ${finished ? 'btn-primary' : ''}`} type="button" onClick={reset}>{restartLabel}</button>}</div></div>
        <div className="practice-quote">{snapshot ? <><strong>{money(candles.at(-1)!.close)}</strong><span>{candles.at(-1)!.date} 종가</span></> : <p>미래 가격은 한 번에 공개되지 않아요.<br />나의 판단을 먼저 남겨보세요.</p>}</div>
        <div ref={chartBox} className="practice-chart-box">
          {pinnedBand != null && decisions[pinnedBand - 1] && <div className="practice-pinned" role="status"><p><b>사건 {pinnedBand}</b> {decisions[pinnedBand - 1].title} · {decisions[pinnedBand - 1].baselineDate}{decisions[pinnedBand - 1].outcomeDate ? ` ~ ${decisions[pinnedBand - 1].outcomeDate}` : ''} 기간을 강조했어요.</p><span><button type="button" className="btn btn-sm" onClick={() => { const n = pinnedBand; scrollTo(articles.current[n]); articles.current[n]?.focus({ preventScroll: true }); }}>기록으로 돌아가기</button><button type="button" className="btn btn-sm" onClick={() => setPinnedBand(null)}>강조 끄기</button></span></div>}
          <CandleChart candles={candles} full={finished} bands={bands} activeBand={activeBand ?? pinnedBand} onActiveBand={setActiveBand} />
        </div>
        <div className="practice-playback"><div><b>{snapshot ? `${candles.length} / ${snapshot.totalDays} 거래일` : '120거래일 이상의 시장 여행'}</b><span>{finished ? '모든 거래일을 확인했어요' : `사건 사이 구간을 ${segmentSeconds(speed)}초에 재생 · 사건이 나오면 자동으로 멈춰요`}</span></div><div className="practice-playback-controls"><PlaybackSpeed speed={speed} onChange={setSpeed} /><button ref={playButton} className="btn btn-sm" disabled={!snapshot || finished || !!visibleEvent || !!error} onClick={() => setPlaying(v => !v)}>{playing ? 'Ⅱ 일시정지' : '▶ 재생'}</button></div></div>
        <progress className="practice-progress" max={snapshot?.totalDays ?? 120} value={candles.length} aria-label="시뮬레이션 진행" />
        {snapshot && <section className="practice-journal"><div className="practice-section-title"><h2>{finished ? '이번 연습 돌아보기' : '나의 선택 기록'}</h2><span>{decisions.length}개의 선택</span></div>
          {decisions.length > 0 && <p id="practiceJournalHint" className="practice-journal-hint">사건을 누르면 차트에서 그 기간을 다시 볼 수 있어요.</p>}
          {!decisions.length ? <p className="practice-muted">아직 만난 사건이 없어요. 차트를 따라가다 보면 선택의 순간이 찾아와요.</p> : decisions.map((r, i) => <article className={`practice-decision ${(activeBand ?? pinnedBand) === i + 1 ? 'active' : ''} practice-clickable`} key={r.eventId} tabIndex={0} ref={el => { articles.current[i + 1] = el; }}
            aria-describedby="practiceJournalHint" aria-current={pinnedBand === i + 1 ? 'true' : undefined} onClick={() => showOnChart(i + 1)}
            onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showOnChart(i + 1); } }}
            onMouseEnter={() => setActiveBand(i + 1)} onMouseLeave={() => setActiveBand(null)} onFocus={() => setActiveBand(i + 1)} onBlur={() => setActiveBand(null)}>
            <div className="practice-decision-meta"><span className="practice-decision-no"><span className="sr-only">사건 </span>{i + 1}</span><time>{r.publishedDate}</time></div><div><h3>{r.title}</h3><p>{r.prediction === 'POSITIVE' ? '긍정적 영향 예상' : '부정적 영향 예상'} · {r.action === 'HOLD' ? '유지' : `${r.action === 'BUY' ? '매수' : '매도'} ${r.allocationPercent}%`}</p><small>{r.execution === 'PENDING' ? '다음 거래일 시가에 체결 예정' : r.execution === 'NO_FILL' ? '거래 가능한 수량이 1주 미만이라 체결하지 않았어요' : r.execution === 'HOLD' ? '보유 상태 유지' : `${r.executedDate} · ${r.executedShares}주 · 주당 ${money(r.executedPrice!)}`}</small></div><div className="practice-outcome">{r.outcome ? <><b>{r.outcome === 'CORRECT' ? '예상과 같았어요' : r.outcome === 'NEUTRAL' ? '가격이 같았어요' : '예상과 달랐어요'}</b><span className={tone(r.subsequentReturnRate!)}>{percent(r.subsequentReturnRate!)}</span><small>이후 5거래일 실제 등락</small></> : <small>5거래일 뒤 확인해요</small>}</div></article>)}
          {finished && <p className="practice-result-note">같은 사건에도 시장은 예상과 다르게 움직일 수 있어요. 이번 결과는 사건의 원인이나 매수·매도의 정답을 뜻하지 않아요.</p>}
        </section>}
      </main>
      <aside className="practice-wallet"><h2>{finished ? '최종 자산' : '나의 자산'}</h2><span className="practice-muted">현금 + 주식 평가액</span><strong className="practice-total">{portfolio ? money(portfolio.total) : '—'}</strong><div className={`practice-profit ${tone(portfolio?.profit ?? 0)}`}>{portfolio ? `${portfolio.profit > 0 ? '+' : ''}${money(portfolio.profit)} (${percent(portfolio.returnRate)})` : '연습을 시작하면 표시돼요'}</div><dl><div><dt>처음 넣은 돈</dt><dd>{snapshot ? money(snapshot.initialAmount) : '—'}</dd></div><div><dt>사용 가능한 현금</dt><dd>{portfolio ? money(portfolio.cash) : '—'}</dd></div><div><dt>주식 평가액</dt><dd>{portfolio ? money(portfolio.stockValue) : '—'}</dd></div><div><dt>보유 수량</dt><dd>{portfolio ? `${fmt.format(portfolio.shares)}주` : '—'}</dd></div><AveragePriceRows averagePrice={portfolio?.averagePrice} close={candles.at(-1)?.close} /></dl>{portfolio && portfolio.shares === 0 && <p className="practice-muted">현재는 주식을 보유하지 않고 현금으로 기다리고 있어요.</p>}<p className="practice-wallet-note">매수·매도는 선택 다음 거래일의 시가로 계산해요. 배당·세금·수수료는 포함하지 않아요.</p><Link to="/invest">투자 인사이트에서 자유롭게 공부하기 ↗</Link></aside>
    </div>
    <footer className="practice-footnote">{snapshot?.notice ?? '과거 자료로 연습하는 가상 투자예요. 미래 수익을 보장하거나 투자를 권유하지 않으며, 실제 투자는 원금 손실이 생길 수 있어요.'}{snapshot && <p>자료: {snapshot.sources.join(' · ')} · 업종 기준일 {snapshot.instrument.classificationAsOf}</p>}</footer>
    <dialog ref={dialog} className="practice-modal" onCancel={e => e.preventDefault()} aria-labelledby="practiceEventTitle">
      {visibleEvent && <form onSubmit={choose}><div className="practice-modal-top"><span>{isSample ? '예시 사건' : '공시 도착'}</span><time>{visibleEvent.publishedDate}</time></div><h2 id="practiceEventTitle">{visibleEvent.title}</h2><p className="practice-muted">{isSample ? '연습을 위해 만든 가상 사건이에요.' : <a href={visibleEvent.sourceUrl} target="_blank" rel="noopener noreferrer">{visibleEvent.sourceName} 원문 확인 ↗</a>} 시세 재생을 잠시 멈췄어요.</p><fieldset disabled={busy}><legend>이 사건 이후, 주가는 어떻게 움직일까요?</legend><div className="practice-choice-row">{(['POSITIVE', 'NEGATIVE'] as const).map(v => <button key={v} type="button" className={prediction === v ? 'selected' : ''} aria-pressed={prediction === v} onClick={() => setPrediction(v)}>{v === 'POSITIVE' ? '↗ 긍정적 영향' : '↘ 부정적 영향'}</button>)}</div><legend>나는 어떤 선택을 할까요?</legend><div className="practice-choice-row">{(['SELL', 'HOLD', 'BUY'] as const).map(v => <button key={v} type="button" className={action === v ? 'selected' : ''} aria-pressed={action === v} onClick={() => setAction(v)}>{v === 'SELL' ? '매도' : v === 'BUY' ? '매수' : '유지'}</button>)}</div>{action && action !== 'HOLD' && <div className="practice-trade-allocation"><span>{action === 'BUY' ? '남은 현금의' : '보유 주식의'}</span>{[25, 50, 100].map(n => <button type="button" key={n} aria-pressed={allocation === n} className={allocation === n ? 'selected' : ''} onClick={() => setAllocation(n)}>{n}%</button>)}</div>}</fieldset><p className="practice-modal-help">현재 현금 {money(portfolio!.cash)} · 보유 {portfolio!.shares}주<br />거래는 다음 거래일 시가에 정수 주로 체결해요. 예상 방향은 이후 5거래일 등락과 비교해요.</p>{error && <p role="alert" className="practice-rise">{error}</p>}<button className="btn btn-primary practice-start" type="submit" disabled={!prediction || !action || busy || !!pending.current}>{busy ? '선택 반영 중…' : '선택하고 계속하기'}</button>{error && pending.current && <button type="button" className="btn practice-start" onClick={retry} disabled={busy}>같은 선택 다시 보내기</button>}<button type="button" className="practice-modal-end" onClick={reset} disabled={busy}>연습 종료</button></form>}
    </dialog>
  </>;
}

const MODES = [
  { id: 'past', label: '과거 시장 연습', lead: '사건을 읽고, 선택하고, 그다음 시장을 만나보세요.' },
  { id: 'virtual', label: '가상 시뮬레이션', lead: '가상 종목의 가상 사건을 읽고, 선택하고, 그다음 시장을 만나보세요.' },
  { id: 'contest', label: '월간 대회', lead: '회원 월간 대회: 가상 종목 매매로 가만히 있을 때보다 얼마나 더 버는지 겨뤄요.' },
] as const;
type Mode = typeof MODES[number]['id'];
// 상단 메뉴가 ?mode=로 고른다. 값이 없거나 잘못되면 과거 시장 연습.
// 월간 대회는 세 번째 탭이다(decisions/2026-11-11-contest-ux-redesign 1). 같은 페이지 안의 탭이라 자유 연습과 오가도 진행 중인 대회 판이 끊기지 않는다
const asMode = (v: string | null): Mode => v === 'virtual' || v === 'contest' ? v : 'past';

export default function Simulation() {
  const [params, setParams] = useSearchParams();
  const mode = asMode(params.get('mode'));
  const go = (next: Mode) => setParams(p => { p.set('mode', next); return p; }, { replace: true });
  // 대회는 처음 들어갈 때 불러오고 그 뒤로는 숨겨 둔다(진행 중인 판 유지)
  const [contestOpened, setContestOpened] = useState(mode === 'contest');
  useEffect(() => { if (mode === 'contest') setContestOpened(true); }, [mode]);
  const tabs = useRef<Record<Mode, HTMLButtonElement | null>>({ past: null, virtual: null, contest: null });
  const select = (next: Mode) => { go(next); tabs.current[next]?.focus(); };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = MODES.length - 1;
    const to = e.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (to < 0) return;
    e.preventDefault(); select(MODES[to].id);
  };
  const inContest = mode === 'contest';
  return <div className="page practice-page">
    <header className="practice-heading"><div><h1>투자 시뮬레이션</h1><p>{MODES.find(m => m.id === mode)!.lead}</p></div><div className="practice-heading-links">
      {/* 대회 화면(배치고사·대회 판 포함)에서는 두지 않는다. 대회는 배치고사 시작 전 안내에만 링크가 있다(Issue #367) */}
      {!inContest && <Link className="btn btn-soft btn-sm practice-guide-btn" to="/simulation/guide"><span aria-hidden="true">?</span>공시 읽는 법</Link>}
      <Link className="practice-insight-link" to="/invest">자유롭게 살펴보기 · 투자 인사이트 ↗</Link>
    </div></header>
    <div className="practice-modes-bar"><div className="practice-modes" role="tablist" aria-label="투자 시뮬레이션 메뉴">
      {MODES.map((m, i) => <button key={m.id} ref={el => { tabs.current[m.id] = el; }} type="button" role="tab" id={`practice-tab-${m.id}`} aria-controls={`practice-panel-${m.id}`}
        aria-selected={mode === m.id} tabIndex={mode === m.id ? 0 : -1} onClick={() => go(m.id)} onKeyDown={e => onKey(e, i)}>
        {m.label}
      </button>)}
    </div></div>
    <div role="tabpanel" id="practice-panel-past" aria-labelledby="practice-tab-past" hidden={mode !== 'past'}><PastMarketPractice active={mode === 'past'} /></div>
    <div role="tabpanel" id="practice-panel-virtual" aria-labelledby="practice-tab-virtual" hidden={mode !== 'virtual'}><VirtualSimulation active={mode === 'virtual'} onGoPast={() => select('past')} /></div>
    <div role="tabpanel" id="practice-panel-contest" aria-labelledby="practice-tab-contest" hidden={!inContest}>{contestOpened && <VirtualContest active={inContest} />}</div>
  </div>;
}
