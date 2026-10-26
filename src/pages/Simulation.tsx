import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CandleChart } from '@/charts/CandleChart';
import { getCategories, practice, type CategoryResponse, type PracticeSnapshot, type Started } from '@/data/practice';
import { ApiError, errorText } from '@/lib/api';
import '@/styles/practice.css';

const fmt = new Intl.NumberFormat('ko-KR');
const money = (n: number) => `${fmt.format(n)}원`;
const percent = (n: number) => `${n > 0 ? '▲ ' : n < 0 ? '▼ ' : ''}${Math.abs(n * 100).toFixed(2)}%`;
const tone = (n: number) => n > 0 ? 'practice-rise' : n < 0 ? 'practice-fall' : '';
// 시작·사건 사이 한 구간을 거래일 수와 관계없이 이 시간에 재생한다
const SEGMENT_MS = 3000;
type Reveal = { from: number; prev: PracticeSnapshot };
type Pending = { path: 'start' | 'step' | 'decision'; body: unknown };

export default function Simulation() {
  const [catalog, setCatalog] = useState<CategoryResponse | null>(null);
  const [category, setCategory] = useState('');
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

  const loadCategories = useCallback(async () => {
    const current = generation.current;
    try { const data = await getCategories(); if (current === generation.current) { setCatalog(data); setCategory(c => c || data.categories[0]?.code || ''); setError(''); } }
    catch (e) { if (current === generation.current) setError(errorText(e)); }
  }, []);
  useEffect(() => { void loadCategories(); return () => {
    generation.current++;
    const existing = token.current; token.current = null;
    if (existing) void practice('end', { sessionToken: existing }).catch(() => {});
  }; }, [loadCategories]);
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
  useEffect(() => {
    setPrediction(null); setAction(null); setAllocation(50);
    if (visibleEvent) { setPlaying(false); dialog.current?.showModal(); }
    else { dialog.current?.close(); playButton.current?.focus({ preventScroll: true }); }
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
      if (request.path !== 'step') setPlaying(true);
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
    if (!playing || !snapshot || error || revealing || busy || snapshot.status !== 'RUNNING' || document.hidden) return;
    void send({ path: 'step', body: { sessionToken: token.current, commandId: crypto.randomUUID(), expectedVersion: snapshot.version } });
  }, [playing, busy, snapshot, revealing, error, send]);
  useEffect(() => {
    if (!playing || !revealing || error) return;
    // 렌더링이 늦어도 구간 전체가 3초에 끝나도록 타이머 횟수가 아니라 경과 시간으로 그릴 봉 수를 정한다(일시정지하면 그 자리에서 이어서)
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
    const old = token.current; token.current = null;
    if (old) void practice('end', { sessionToken: old }).catch(() => {});
  };
  const start = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 10000 || value > 100000000) { setError('투자금은 1만 원부터 1억 원까지 원 단위로 입력해 주세요.'); return; }
    void send({ path: 'start', body: { startId: crypto.randomUUID(), categoryCode: category, initialAmount: value } });
  };
  const choose = (event: React.FormEvent) => {
    event.preventDefault();
    if (!prediction || !action || !snapshot?.event || revealing) return;
    void send({ path: 'decision', body: { sessionToken: token.current, commandId: crypto.randomUUID(), expectedVersion: snapshot.version,
      eventId: snapshot.event.id, prediction, action, allocationPercent: action === 'HOLD' ? 0 : allocation } });
  };
  const isSample = snapshot?.isSample ?? catalog?.isSample;
  // 구간을 그리는 동안에는 그날까지의 봉·자산만 보이고, 구간 안에서 확정된 판정은 다 그린 뒤 보인다
  const candles = snapshot ? snapshot.candles.slice(0, shown) : [];
  const portfolio = revealing ? (snapshot!.frames[shown - reveal!.from - 1]?.portfolio ?? reveal!.prev.portfolio) : snapshot?.portfolio;
  const decisions = revealing ? reveal!.prev.decisions : snapshot?.decisions ?? [];
  const finished = !revealing && snapshot?.status === 'FINISHED';
  const retry = () => { if (pending.current) void send(pending.current); else if (!catalog) void loadCategories(); else setError(''); };
  return <div className="page practice-page">
    <header className="practice-heading"><div><h1>투자 시뮬레이션</h1><p>사건을 읽고, 선택하고, 그다음 시장을 만나보세요.</p></div><Link className="practice-insight-link" to="/invest">자유롭게 살펴보기 · 투자 인사이트 ↗</Link></header>
    <div className="practice-notice"><span>{isSample ? '예시 모드' : '과거 시장 연습'}</span><p>{isSample ? '학습용으로 만든 가상 기업·시세·사건이에요. 실제 기업의 투자 결과가 아니에요.' : '과거 시세를 따라가는 가상 투자예요. 실제 주문이나 계좌 연결은 이루어지지 않아요.'}</p></div>
    {error && <div className="practice-error" role="alert"><p>{error}</p><button className="btn btn-sm" onClick={retry} disabled={busy}>다시 시도</button></div>}
    <div className="practice-workspace">
      <aside className="practice-setup">
        <h2>{snapshot ? '이번 연습' : '어떤 산업을 만나볼까요?'}</h2>
        <p className="practice-muted">업종을 고르면 종목 하나를 무작위로 골라드려요.</p>
        <form onSubmit={start}>
          <fieldset disabled={!!snapshot || busy}><legend>회사 카테고리</legend>
            {!catalog ? <p role="status">업종을 불러오고 있어요…</p> : catalog.categories.length === 0 ? <p>시세와 사건 자료를 준비하고 있어요. 잠시 후 다시 확인해 주세요.</p> : catalog.categories.map(c => <label className={`practice-category ${category === c.code ? 'selected' : ''}`} key={c.code}>
              <input type="radio" name="industry" value={c.code} checked={category === c.code} onChange={() => setCategory(c.code)} /><span><b>{c.name}</b><small>{c.eligibleCount}개 종목 중 무작위</small></span><span aria-hidden="true">{category === c.code ? '●' : '○'}</span>
            </label>)}
            <label className="practice-amount-label" htmlFor="practiceAmount">연습할 투자금</label>
            <div className="practice-amount"><input id="practiceAmount" type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))} maxLength={9} aria-describedby="practiceAmountHelp" /><span>원</span></div>
            <small id="practiceAmountHelp">1만 원 ~ 1억 원</small>
            <div className="practice-amount-presets">{[1000000, 5000000, 10000000].map(n => <button key={n} type="button" onClick={() => setAmount(String(n))}>{fmt.format(n / 10000)}만</button>)}</div>
          </fieldset>
          <p className="practice-allocation">처음에는 투자금의 50%로 주식을 사고, 나머지는 추가 매수를 위한 현금으로 남겨요.</p>
          {!snapshot ? <button className="btn btn-primary practice-start" type="submit" disabled={busy || !category || !catalog?.categories.length}>{busy ? '연습 준비 중…' : '시뮬레이션 시작'}</button> : <button className="btn practice-start" type="button" onClick={reset} disabled={busy}>{finished ? '다른 종목으로 다시 연습' : '연습 종료하고 다시 설정'}</button>}
        </form>
        <div className="practice-guide"><h3>이렇게 진행해요</h3><ol><li>사건과 사건 사이 시세가 3초 동안 지나가요.</li><li>사건이 나오면 방향과 거래를 선택해요.</li><li>이후 5거래일의 움직임을 확인해요.</li></ol></div>
      </aside>
      <main className="practice-market">
        <div className="practice-market-head"><div><span className="practice-muted">{snapshot ? snapshot.instrument.categoryName : '나의 투자 연습'}</span><h2>{snapshot?.instrument.name ?? '다음 장면은 아직 몰라요'}</h2></div><span className="practice-state">{finished ? '연습 완료' : visibleEvent ? '사건 도착' : !snapshot ? '시작 전' : playing ? '재생 중' : '일시정지'}</span></div>
        <div className="practice-quote">{snapshot ? <><strong>{money(candles.at(-1)!.close)}</strong><span>{candles.at(-1)!.date} 종가</span></> : <p>미래 가격은 한 번에 공개되지 않아요.<br />나의 판단을 먼저 남겨보세요.</p>}</div>
        <CandleChart candles={candles} />
        <div className="practice-playback"><div><b>{snapshot ? `${candles.length} / 120 거래일` : '120거래일의 시장 여행'}</b><span>{finished ? '모든 거래일을 확인했어요' : '사건 사이 구간을 3초에 재생 · 사건이 나오면 자동으로 멈춰요'}</span></div><button ref={playButton} className="btn btn-sm" disabled={!snapshot || finished || !!visibleEvent || !!error} onClick={() => setPlaying(v => !v)}>{playing ? 'Ⅱ 일시정지' : '▶ 재생'}</button></div>
        <progress className="practice-progress" max={120} value={candles.length} aria-label="시뮬레이션 진행" />
        {snapshot && <section className="practice-journal"><div className="practice-section-title"><h2>{finished ? '이번 연습 돌아보기' : '나의 선택 기록'}</h2><span>{decisions.length}개의 선택</span></div>
          {!decisions.length ? <p className="practice-muted">아직 만난 사건이 없어요. 차트를 따라가다 보면 선택의 순간이 찾아와요.</p> : decisions.map(r => <article className="practice-decision" key={r.eventId}><time>{r.publishedDate}</time><div><h3>{r.title}</h3><p>{r.prediction === 'POSITIVE' ? '긍정적 영향 예상' : '부정적 영향 예상'} · {r.action === 'HOLD' ? '유지' : `${r.action === 'BUY' ? '매수' : '매도'} ${r.allocationPercent}%`}</p><small>{r.execution === 'PENDING' ? '다음 거래일 시가에 체결 예정' : r.execution === 'NO_FILL' ? '거래 가능한 수량이 1주 미만이라 체결하지 않았어요' : r.execution === 'HOLD' ? '보유 상태 유지' : `${r.executedDate} · ${r.executedShares}주 · 주당 ${money(r.executedPrice!)}`}</small></div><div className="practice-outcome">{r.outcome ? <><b>{r.outcome === 'CORRECT' ? '예상과 같았어요' : r.outcome === 'NEUTRAL' ? '가격이 같았어요' : '예상과 달랐어요'}</b><span className={tone(r.subsequentReturnRate!)}>{percent(r.subsequentReturnRate!)}</span><small>이후 5거래일 실제 등락</small></> : <small>5거래일 뒤 확인해요</small>}</div></article>)}
          {finished && <p className="practice-result-note">같은 사건에도 시장은 예상과 다르게 움직일 수 있어요. 이번 결과는 사건의 원인이나 매수·매도의 정답을 뜻하지 않아요.</p>}
        </section>}
      </main>
      <aside className="practice-wallet"><h2>{finished ? '최종 자산' : '나의 자산'}</h2><span className="practice-muted">현금 + 주식 평가액</span><strong className="practice-total">{portfolio ? money(portfolio.total) : '—'}</strong><div className={`practice-profit ${tone(portfolio?.profit ?? 0)}`}>{portfolio ? `${portfolio.profit > 0 ? '+' : ''}${money(portfolio.profit)} (${percent(portfolio.returnRate)})` : '연습을 시작하면 표시돼요'}</div><dl><div><dt>처음 넣은 돈</dt><dd>{snapshot ? money(snapshot.initialAmount) : '—'}</dd></div><div><dt>사용 가능한 현금</dt><dd>{portfolio ? money(portfolio.cash) : '—'}</dd></div><div><dt>주식 평가액</dt><dd>{portfolio ? money(portfolio.stockValue) : '—'}</dd></div><div><dt>보유 수량</dt><dd>{portfolio ? `${fmt.format(portfolio.shares)}주` : '—'}</dd></div></dl>{portfolio && portfolio.shares === 0 && <p className="practice-muted">현재는 주식을 보유하지 않고 현금으로 기다리고 있어요.</p>}<p className="practice-wallet-note">매수·매도는 선택 다음 거래일의 시가로 계산해요. 배당·세금·수수료는 포함하지 않아요.</p><Link to="/invest">투자 인사이트에서 자유롭게 공부하기 ↗</Link></aside>
    </div>
    <footer className="practice-footnote">{snapshot?.notice ?? '과거 자료로 연습하는 가상 투자예요. 미래 수익을 보장하거나 투자를 권유하지 않으며, 실제 투자는 원금 손실이 생길 수 있어요.'}{snapshot && <p>자료: {snapshot.sources.join(' · ')} · 업종 기준일 {snapshot.instrument.classificationAsOf}</p>}</footer>
    <dialog ref={dialog} className="practice-modal" onCancel={e => e.preventDefault()} aria-labelledby="practiceEventTitle">
      {visibleEvent && <form onSubmit={choose}><div className="practice-modal-top"><span>{isSample ? '예시 사건' : '공시 도착'}</span><time>{visibleEvent.publishedDate}</time></div><h2 id="practiceEventTitle">{visibleEvent.title}</h2><p className="practice-muted">{isSample ? '연습을 위해 만든 가상 사건이에요.' : <a href={visibleEvent.sourceUrl} target="_blank" rel="noopener noreferrer">{visibleEvent.sourceName} 원문 확인 ↗</a>} 시세 재생을 잠시 멈췄어요.</p><fieldset disabled={busy}><legend>이 사건 이후, 주가는 어떻게 움직일까요?</legend><div className="practice-choice-row">{(['POSITIVE', 'NEGATIVE'] as const).map(v => <button key={v} type="button" className={prediction === v ? 'selected' : ''} aria-pressed={prediction === v} onClick={() => setPrediction(v)}>{v === 'POSITIVE' ? '↗ 긍정적 영향' : '↘ 부정적 영향'}</button>)}</div><legend>나는 어떤 선택을 할까요?</legend><div className="practice-choice-row">{(['SELL', 'HOLD', 'BUY'] as const).map(v => <button key={v} type="button" className={action === v ? 'selected' : ''} aria-pressed={action === v} onClick={() => setAction(v)}>{v === 'SELL' ? '매도' : v === 'BUY' ? '매수' : '유지'}</button>)}</div>{action && action !== 'HOLD' && <div className="practice-trade-allocation"><span>{action === 'BUY' ? '남은 현금의' : '보유 주식의'}</span>{[25, 50, 100].map(n => <button type="button" key={n} aria-pressed={allocation === n} className={allocation === n ? 'selected' : ''} onClick={() => setAllocation(n)}>{n}%</button>)}</div>}</fieldset><p className="practice-modal-help">현재 현금 {money(portfolio!.cash)} · 보유 {portfolio!.shares}주<br />거래는 다음 거래일 시가에 정수 주로 체결해요. 예상 방향은 이후 5거래일 등락과 비교해요.</p>{error && <p role="alert" className="practice-rise">{error}</p>}<button className="btn btn-primary practice-start" type="submit" disabled={!prediction || !action || busy || !!pending.current}>{busy ? '선택 반영 중…' : '선택하고 계속하기'}</button>{error && pending.current && <button type="button" className="btn practice-start" onClick={retry} disabled={busy}>같은 선택 다시 보내기</button>}<button type="button" className="practice-modal-end" onClick={reset} disabled={busy}>연습 종료</button></form>}
    </dialog>
  </div>;
}
