import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { useLoginModal } from '@/components/LoginModal';
import {
  BOARD_LABEL, BOARDS, getContest, getMyContests, getRanking, startPlacement, submitPlacement,
  type ContestBoard, type ContestEntry, type ContestInfo, type ContestMine, type ContestPlacement, type ContestPlacementResult, type ContestRanking,
  type ContestRankingRow, type Prediction,
} from '@/data/virtualContest';
import { getVirtualSimStatus } from '@/data/virtualSim';
import { ApiError, errorText } from '@/lib/api';
import { VirtualSimulation } from '@/pages/VirtualSimulation';
import '@/styles/contest.css';

// 가상 시뮬레이션 대회(decisions/2026-11-05-virtual-sim-contest, policies §8-8). 회원만 참가하고 대회 안내만 누구나 본다.
// 금액·수익률·점수·순위는 서버 값을 그대로 보인다(화면에서 다시 계산하지 않는다). 판 진행은 가상 시뮬레이션 화면을 대회 판으로 쓴다.
const fmt = new Intl.NumberFormat('ko-KR');
const money = (n: number) => `${fmt.format(n)}원`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt.format(Math.abs(n))}원`;
const percent = (n: number) => `${n > 0 ? '▲ ' : n < 0 ? '▼ ' : ''}${Math.abs(n * 100).toFixed(2)}%`;
/** 매매 성과(유지 대비 초과 수익률)는 두 수익률의 차이라 %p로 보인다. 0.018 → "+1.80%p" */
const pp = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(2)}%p`;
const tone = (n: number) => n > 0 ? 'practice-rise' : n < 0 ? 'practice-fall' : '';
const points = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}점`;
/** 0.6676 → 66.7(보여 주기만, 내림) */
const share = (n: number) => (Math.floor(n * 1000) / 10).toFixed(1);
const contestName = (id: string) => `${id.slice(0, 4)}년 ${Number(id.slice(5))}월 대회`;
const dateText = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-'); return `${Number(m)}월 ${Number(d)}일`; };

type View = 'home' | 'placement' | 'result' | 'play';

/** 대회 안내·규칙(누구나) */
function Rules({ info }: { info: ContestInfo }) {
  const r = info.rules;
  return <details className="contest-rules">
    <summary>대회 규칙 자세히 보기</summary>
    <ul>
      <li>매달 1일 00시에 열고 다음 달 1일 00시에 마감해요. 시즌마다 배치고사 {r.placementQuestions}문제로 시작 판을 정해요(맞힌 수 {r.placementCuts.B50M}개 이상 5천만 판, {r.placementCuts.B100M}개 이상 1억 판, 그 아래 1천만 판).</li>
      <li>배치고사는 실제 과거 공시 10개(경향이 뚜렷한 유형 6개 + 나머지 4개)를 보고 그 뒤 5거래일 동안 오를지 내릴지 골라요. 실제 움직임으로 채점하고, 회사 이름과 날짜는 제출한 뒤 공개해요. 30분이 지나면 고르지 않은 문제는 틀린 것으로 봐요.</li>
      <li>한 판은 지금 대회 잔액 전부로 시작하고 120거래일 동안 사건 {r.eventsPerRound}개를 만나요. 판이 끝난 총자산이 다음 판의 잔액이 되고, 대회 판은 채점하지 않아요.</li>
      <li>하루에 {r.roundsPerDay}판까지 할 수 있어요. 하루 점수는 그날 판들의 매매 성과 평균으로 정해요. 매매 성과는 내 판 수익률에서 같은 가격 흐름에 사건마다 가만히(유지) 있었을 때의 수익률을 뺀 값이에요(예: 내 판 +11.07%, 가만히 +9.27%면 +1.80%p). 그날 {r.roundsForDailyScore}판을 모두 하면 평균이 {pp(r.dailyTargetRate)} 이상일 때 +1, 못 미치면 −1이고, {r.roundsForDailyScore}판을 채우지 않은 날은 0이에요. 가만히만 있으면 0%p라 목표에 못 미쳐요.</li>
      <li>주(1~7일, 8~14일, 15~21일, 22~28일, 29일~말일) 점수 합이 {points(r.weeklyPromoteAt)} 이상이면 한 단계 승급, {points(r.weeklyDemoteAt)} 이하면 한 단계 강등이에요. 판이 바뀌면 잔액은 새 판의 대회 시드머니로 다시 시작해요.</li>
      <li>판이 끝난 뒤 잔액이 {money(r.liquidationBelow)} 미만이면 이번 시즌은 청산되어 더 할 수 없어요.</li>
      <li>순위는 판 점수 → 매매 성과 평균 → 그 값에 먼저 도달한 순서로 정하고, 판별 상위 {r.rankingTop}위와 내 순위를 회원만 봐요. 이름 대신 서버가 붙인 별명이 보여요.</li>
      <li>판을 그만두거나 창을 닫으면 남은 사건은 유지로 보고 끝까지 계산해 잔액에 반영해요.</li>
    </ul>
  </details>;
}

/** 배치고사 맞힌 수 → 시작 판(서버 규칙 placementCuts). 참가 전 화면의 배치고사 카드에 둔다 */
function PlacementBoards({ info }: { info: ContestInfo }) {
  const { B50M, B100M } = info.rules.placementCuts, total = info.rules.placementQuestions;
  const range: Record<ContestBoard, string> = { B10M: `0~${B50M - 1}개`, B50M: `${B50M}~${B100M - 1}개`, B100M: `${B100M}~${total}개` };
  return <ul className="contest-placement-boards" aria-label="맞힌 수로 정해지는 시작 판">
    {info.boards.map(b => <li key={b.board}><span>맞힌 수 {range[b.board]}</span><b>{BOARD_LABEL[b.board]}</b><small>{money(b.seedMoney)}로 시작 · 참가 {fmt.format(b.participants)}명</small></li>)}
  </ul>;
}

/** 판별 대회 시드머니·참가자. mine: 지금 내 판(강조) */
function BoardChips({ info, mine }: { info: ContestInfo; mine?: ContestBoard }) {
  return <ul className="contest-boards" aria-label="판별 대회 시드머니와 참가자">
    {info.boards.map(b => <li key={b.board} className={b.board === mine ? 'mine' : ''} aria-current={b.board === mine ? 'true' : undefined}>
      <div className="contest-board-top"><b>{BOARD_LABEL[b.board]}</b>{b.board === mine ? <span className="contest-chip">내 판</span> : !b.available && <span className="contest-chip muted">준비 중</span>}</div>
      <strong>{money(b.seedMoney)}</strong>
      <small>참가 {fmt.format(b.participants)}명</small>
    </li>)}
  </ul>;
}

/** 배치고사 남은 시간(mm:ss). 시각 비교만 하고 채점은 서버가 한다 */
function useRemaining(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
}

function PlacementForm({ placement, busy, error, onSubmit, onBack }: { placement: ContestPlacement; busy: boolean; error: string;
  onSubmit: (answers: Record<string, Prediction>) => void; onBack: () => void }) {
  const [answers, setAnswers] = useState<Record<string, Prediction>>({});
  const left = useRemaining(placement.expiresAt);
  const missing = placement.questions.filter(q => !answers[q.id]).length;
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(answers); };
  return <form className="contest-placement" onSubmit={submit}>
    <div className="contest-placement-head">
      <div><h2>배치고사</h2><p className="practice-muted">실제 과거 공시를 보고, 그 뒤 5거래일 동안 주가가 올랐을지 내렸을지 골라요. 실제 움직임으로 채점해 시작 판을 정해요.</p></div>
      <p className={`contest-timer ${left != null && left < 300 ? 'urgent' : ''}`} role="timer" aria-live="off">{left == null ? '' : left > 0 ? `남은 시간 ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : '시간이 지났어요. 제출하면 고른 답 없이 채점된 결과를 보여 줘요'}</p>
    </div>
    <ol className="contest-questions">
      {placement.questions.map((q, i) => <li key={q.id}>
        <fieldset>
          <legend><span className="contest-q-no">{i + 1}</span>{q.industry} 회사 <span className="contest-chip">{q.categoryName}</span></legend>
          <h3>{q.title}</h3>
          {q.body ? <p>{q.body}</p> : <p className="contest-q-hint">실제 과거 공시예요. 회사 이름과 날짜는 제출한 뒤 공개해요.</p>}
          <div className="contest-answer" role="group" aria-label={`${i + 1}번 답`}>
            {(['POSITIVE', 'NEGATIVE'] as const).map(v => <button key={v} type="button" className={`${v === 'POSITIVE' ? 'up' : 'down'} ${answers[q.id] === v ? 'selected' : ''}`}
              aria-pressed={answers[q.id] === v} onClick={() => setAnswers(a => ({ ...a, [q.id]: a[q.id] === v ? null : v }))}>{v === 'POSITIVE' ? '▲ 오른다' : '▼ 내린다'}</button>)}
          </div>
        </fieldset>
      </li>)}
    </ol>
    <div className="contest-placement-foot">
      {missing > 0 && <p className="practice-muted">고르지 않은 문제 {missing}개는 틀린 것으로 채점해요.</p>}
      {error && <p role="alert" className="practice-rise">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '채점 중…' : '제출하고 시작 판 보기'}</button>
      <button className="btn" type="button" onClick={onBack} disabled={busy}>나중에 이어 풀기</button>
    </div>
  </form>;
}

function PlacementDone({ result, onStart }: { result: ContestPlacementResult; onStart: () => void }) {
  return <section className="contest-card contest-result" aria-labelledby="contestResultTitle">
    <h2 id="contestResultTitle">배치고사 결과</h2>
    <p className="contest-big">{result.total}문제 중 <b>{result.correct}개</b> 맞혔어요 → <b>{BOARD_LABEL[result.board]}</b>에서 시작해요</p>
    <p className="practice-muted">시작 잔액은 {money(result.entry.seedMoney)}이에요. 공시 하나 뒤의 5거래일은 같은 유형이어도 방향이 자주 갈려서, 배치고사는 시작 판을 정하는 가벼운 퀴즈예요. 실력은 주간 점수로 겨뤄요.</p>
    <ol className="contest-graded">
      {result.items.map((it, i) => <li key={it.questionId} className={it.correct ? 'ok' : 'no'}>
        <span className="contest-q-no">{i + 1}</span>
        <span>{it.correct ? '맞음' : '틀림'} · <b>{it.company}</b>{it.date ? ` · ${it.date}` : ''} · 5거래일 뒤 <b className={tone(it.subsequentReturnRate)}>{percent(it.subsequentReturnRate)}</b> · 내 답 {it.prediction === 'POSITIVE' ? '오른다' : it.prediction === 'NEGATIVE' ? '내린다' : '고르지 않음'}</span>
        {it.categorySampleCount != null && it.categoryUpShare != null && it.categoryDownShare != null && <small>같은 유형 공시 {fmt.format(it.categorySampleCount)}건 중 {share(it.categoryUpShare)}% 올랐고 {share(it.categoryDownShare)}% 내렸어요{it.trend === 'MIXED' ? ' · 방향을 알기 어려운 유형' : it.trend === 'UP' ? ' · 대체로 오른 유형' : it.trend === 'DOWN' ? ' · 대체로 내린 유형' : ''}</small>}
      </li>)}
    </ol>
    <button className="btn btn-primary" type="button" onClick={onStart}>대회 화면으로</button>
  </section>;
}

function Dashboard({ entry, onPlay, busy }: { entry: ContestEntry; onPlay: () => void; busy: boolean }) {
  const t = entry.today, w = entry.week, change = entry.lastBoardChange;
  const up = change ? BOARDS.indexOf(change.to) > BOARDS.indexOf(change.from) : false;
  const rate = t.returnRate;
  const progress = rate == null ? 0 : Math.max(0, Math.min(1, rate / t.targetRate));
  return <>
    {change && <div className={`contest-banner ${up ? 'up' : 'down'}`} role="status"><b>{up ? '승급' : '강등'}</b> 주 점수 {points(change.weekPoints)}로 {BOARD_LABEL[change.from]}에서 {BOARD_LABEL[change.to]}{up ? '으로 올라왔어요' : '으로 내려왔어요'}. 잔액은 새 판의 대회 시드머니로 다시 시작했어요. <small>{dateText(change.at)}</small></div>}
    {entry.liquidated && <div className="contest-banner down" role="status"><b>청산</b> 잔액이 100만 원 미만으로 끝나 이번 대회는 더 할 수 없어요. 지금 판·점수로 순위에 남아요.</div>}
    <section className="contest-stats" aria-label="내 대회 기록">
      <div className="contest-stat"><span>지금 판</span><strong>{BOARD_LABEL[entry.board]}</strong><small>대회 시드머니 {money(entry.seedMoney)}</small></div>
      <div className="contest-stat"><span>현재 잔액</span><strong>{money(entry.balance)}</strong><small className={tone(entry.profit)}>불린 금액 {signed(entry.profit)}</small></div>
      <div className="contest-stat"><span>매매 성과 평균</span><strong className={tone(entry.excessRate ?? 0)}>{entry.excessRate == null ? '—' : pp(entry.excessRate)}</strong><small>판 수익률 {percent(entry.returnRate)} · 끝낸 판 {fmt.format(entry.rounds)}판</small></div>
      <div className="contest-stat"><span>판 점수 · 순위</span><strong>{points(entry.boardPoints)}</strong><small>{fmt.format(entry.participants)}명 중 {fmt.format(entry.rank)}위</small></div>
    </section>
    <div className="contest-grid">
      <section className="contest-card" aria-labelledby="contestTodayTitle">
        <h2 id="contestTodayTitle">오늘 목표</h2>
        <p className="contest-big">{rate == null ? (t.rounds ? '오늘 끝낸 판이 아직 없어요' : '오늘 아직 판을 하지 않았어요') : <>오늘 매매 성과 평균 <b className={tone(rate)}>{pp(rate)}</b> · 목표 {pp(t.targetRate)} 이상</>}</p>
        <div className="contest-meter" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
        <p className="practice-muted">{t.startBalance == null ? `하루 10판을 모두 하면 매매 성과(내 판 수익률 − 가만히 있었을 때 수익률)의 평균이 ${pp(t.targetRate)} 이상일 때 +1점, 못 미치면 −1점이에요. 10판을 채우지 않은 날은 0점이에요.` : `오늘 끝낸 판마다 "내 판 수익률 − 가만히 있었을 때 수익률"을 평균한 값이에요. 10판을 모두 해야 하루 점수를 매겨요(지금 ${t.rounds}/10판).`}</p>
        <div className="contest-play">
          <span>오늘 {t.rounds}판 · <b>{t.roundsLeft}판 남음</b></span>
          <button className="btn btn-primary" type="button" onClick={onPlay} disabled={busy || entry.liquidated || t.roundsLeft === 0}>{entry.activeRound ? '진행 중인 판 대신 새 판 시작' : '판 시작'}</button>
        </div>
        {entry.activeRound && <p className="practice-muted">진행 중인 판이 있어요. 새 판을 시작하면 그 판은 남은 사건을 유지로 보고 정산해요.</p>}
      </section>
      <section className="contest-card" aria-labelledby="contestWeekTitle">
        <h2 id="contestWeekTitle">이번 주 점수 <small>{w.week}주 · {dateText(w.endsOn)}까지</small></h2>
        <p className="contest-big"><b>{points(w.points)}</b></p>
        <div className="contest-week" aria-hidden="true">{[-4, -3, -2, -1, 0, 1, 2, 3, 4].map(n => <span key={n} className={n === Math.max(-4, Math.min(4, w.points)) ? 'now' : n === 4 ? 'promote' : n === -4 ? 'demote' : ''}>{n}</span>)}</div>
        <p className="practice-muted">{w.week === 5 ? '29일부터의 짧은 주는 판이 바뀌지 않아요.' : `주가 끝날 때 +4점 이상이면 ${entry.board === 'B100M' ? '그대로(1억 판은 승급 없음)' : '한 단계 승급'}, −4점 이하면 ${entry.board === 'B10M' ? '그대로(1천만 판은 강등 없음)' : '한 단계 강등'}이에요.`}</p>
      </section>
    </div>
  </>;
}

const END_REASON: Record<string, string> = { COMPLETED: '완주', ENDED: '그만둠', EXPIRED: '시간 만료', RESTARTED: '서버 재시작', REPLACED: '새 판 시작', CLOSED: '대회 마감' };

/** 내 판 기록: 날짜별로 묶고, 하루 점수를 정한 날은 그날 점수·평균을 함께 보인다(모두 서버 값) */
function RoundHistory({ entry }: { entry: ContestEntry }) {
  if (!entry.recentRounds.length) return <p className="practice-muted">아직 한 판이 없어요. 판을 끝내면 여기에 결과가 쌓여요.</p>;
  const days = new Map(entry.scoredDays.map(d => [d.date, d]));
  const groups: { date: string; rounds: ContestEntry['recentRounds'] }[] = [];
  for (const r of entry.recentRounds) {
    const last = groups.at(-1);
    if (last && last.date === r.date) last.rounds.push(r); else groups.push({ date: r.date, rounds: [r] });
  }
  return <div className="contest-rounds">
    {groups.map(g => {
      const day = days.get(g.date);
      return <section key={g.date} aria-label={`${dateText(g.date)} 판 기록`}>
        <h3>{dateText(g.date)}<span>{day ? <>하루 점수 <b className={day.points > 0 ? 'practice-rise' : day.points < 0 ? 'practice-fall' : ''}>{points(day.points)}</b>{day.excessRate != null && <> · 매매 성과 평균 {pp(day.excessRate)}</>}</> : '하루가 끝나면 점수를 정해요'}</span></h3>
        <div className="contest-table-wrap"><table className="contest-table">
          <thead><tr><th scope="col">판</th><th scope="col">끝난 방식</th><th scope="col" className="num">내 판</th><th scope="col" className="num">가만히 있었다면</th><th scope="col" className="num">매매 성과</th><th scope="col" className="num">끝 잔액</th></tr></thead>
          <tbody>{g.rounds.map(r => <tr key={r.roundNumber}>
            <td>{r.roundNumber}번째 · {BOARD_LABEL[r.board]}</td>
            <td>{r.status === 'ACTIVE' ? '진행 중' : END_REASON[r.endReason ?? ''] ?? '—'}</td>
            <td className={`num ${tone(r.returnRate ?? 0)}`}>{r.returnRate == null ? '—' : percent(r.returnRate)}</td>
            <td className={`num ${tone(r.holdReturnRate ?? 0)}`}>{r.holdReturnRate == null ? '—' : percent(r.holdReturnRate)}</td>
            <td className={`num ${tone(r.excessRate ?? 0)}`}><b>{r.excessRate == null ? '—' : pp(r.excessRate)}</b></td>
            <td className="num">{r.endBalance == null ? '—' : money(r.endBalance)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>;
    })}
    <p className="practice-muted">최근 30판까지 보여요. 그만두거나 시간이 지난 판도 남은 사건을 유지로 보고 끝까지 계산한 결과예요.</p>
  </div>;
}

function RankingTable({ ranking }: { ranking: ContestRanking }) {
  const row = (r: ContestRankingRow) => <tr key={`${r.rank}-${r.alias}`} className={r.isMe ? 'me' : ''}>
    <td>{fmt.format(r.rank)}</td><td>{r.alias}{r.isMe && <span className="contest-chip">나</span>}{r.liquidated && <span className="contest-chip muted">청산</span>}</td>
    <td>{points(r.boardPoints)}</td><td className={`num ${tone(r.excessRate ?? 0)}`}>{r.excessRate == null ? '—' : pp(r.excessRate)}</td><td className="num">{money(r.balance)}</td><td className="num">{fmt.format(r.rounds)}</td>
  </tr>;
  const meOutside = ranking.me && !ranking.items.some(r => r.isMe);
  if (!ranking.items.length) return <p className="practice-muted">아직 이 판에 참가자가 없어요.</p>;
  return <div className="contest-table-wrap">
    <table className="contest-table">
      <caption className="sr-only">{BOARD_LABEL[ranking.board]} 순위</caption>
      <thead><tr><th scope="col">순위</th><th scope="col">별명</th><th scope="col">판 점수</th><th scope="col" className="num">매매 성과 평균</th><th scope="col" className="num">잔액</th><th scope="col" className="num">판 수</th></tr></thead>
      <tbody>{ranking.items.map(row)}{meOutside && ranking.me && row(ranking.me)}</tbody>
    </table>
  </div>;
}

/** onExit: 자유 연습(가상 시뮬레이션)으로 돌아가기 */
export function VirtualContest({ active, onExit }: { active: boolean; onExit?: () => void }) {
  const { status } = useSession();
  const member = status === 'member';
  const { openLogin } = useLoginModal();
  const location = useLocation();
  const [info, setInfo] = useState<ContestInfo | null>(null);
  const [mine, setMine] = useState<ContestMine | null>(null);
  const [sample, setSample] = useState(false);
  const [view, setView] = useState<View>('home');
  const [placement, setPlacement] = useState<ContestPlacement | null>(null);
  const [result, setResult] = useState<ContestPlacementResult | null>(null);
  const [board, setBoard] = useState<ContestBoard | null>(null);
  const [ranking, setRanking] = useState<ContestRanking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const [contest, me] = await Promise.all([getContest(), member ? getMyContests() : Promise.resolve(null)]);
      if (current !== generation.current) return;
      setInfo(contest); setMine(me); setError('');
      setBoard(b => b ?? me?.current?.board ?? 'B10M');
    } catch (e) { if (current === generation.current) setError(errorText(e)); }
  }, [member]);
  useEffect(() => { if (status !== 'loading') void load(); }, [load, status]);
  useEffect(() => { void getVirtualSimStatus().then(s => setSample(s.isSample)).catch(() => {}); }, []);
  useEffect(() => { if (!member) { setView('home'); setPlacement(null); setResult(null); } }, [member]);

  // 판별 랭킹(회원만)
  useEffect(() => {
    if (!member || !info || !board || view === 'play') return;
    let alive = true;
    getRanking(info.contestId, board).then(r => { if (alive) setRanking(r); }).catch(() => { if (alive) setRanking(null); });
    return () => { alive = false; };
  }, [member, info, board, view, mine]);

  const beginPlacement = async () => {
    setBusy(true); setError('');
    try { setPlacement(await startPlacement()); setView('placement'); }
    catch (e) { setError(errorText(e)); if (e instanceof ApiError && e.code === 'CONTEST_ALREADY_JOINED') void load(); }
    finally { setBusy(false); }
  };
  const submit = async (answers: Record<string, Prediction>) => {
    if (!placement) return;
    setBusy(true); setError('');
    try {
      const graded = await submitPlacement(placement.placementId, placement.questions.map(q => ({ questionId: q.id, prediction: answers[q.id] ?? null })));
      setResult(graded); setView('result'); setBoard(graded.board); void load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const settled = useCallback(() => { void load(); }, [load]);
  const exit = useCallback(() => { setView('home'); }, []);

  if (!info) return <section className="contest-card">{error ? <div className="practice-error" role="alert"><p>{error}</p><button className="btn btn-sm" onClick={() => void load()}>다시 시도</button></div> : <p className="practice-muted">대회 정보를 불러오는 중…</p>}</section>;

  const entry = mine?.current ?? null;
  if (view === 'play' && entry) {
    return <VirtualSimulation active={active} onGoPast={exit} contest={{ board: entry.board, today: entry.today, onSettled: settled, onExit: exit }} />;
  }
  // 판별 랭킹(회원만): 오늘 목표·이번 주 점수 아래에 둔다
  const rankingCard = <section className="contest-card" aria-labelledby="contestRankTitle">
      <div className="contest-card-head">
        <h2 id="contestRankTitle">판별 랭킹 <small>{ranking?.status === 'SETTLED' ? '확정' : '지금 기준'}</small></h2>
        <div className="contest-seg" role="group" aria-label="판 고르기">{BOARDS.map(b => <button key={b} type="button" aria-pressed={board === b} className={board === b ? 'selected' : ''} onClick={() => setBoard(b)}>{BOARD_LABEL[b]}</button>)}</div>
      </div>
      {ranking ? <RankingTable ranking={ranking} /> : <p className="practice-muted">랭킹을 불러오는 중…</p>}
      <p className="practice-muted">판 점수가 같으면 지금 판에서 끝낸 판들의 매매 성과(가만히 있었을 때보다 높은 수익률, %p) 평균이 높은 순이에요. 별명 외의 회원 정보는 보이지 않아요.</p>
    </section>;
  const daysLeft = Math.max(0, Math.ceil((new Date(info.endsAt).getTime() - Date.now()) / 86400000));
  return <div className="contest">
    {onExit && <button type="button" className="contest-back" onClick={onExit}>← 자유 연습으로</button>}
    <section className="contest-hero" aria-labelledby="contestHeroTitle">
      <div>
        <span className="contest-hero-kicker">회원 월간 대회 · 진행 중{sample && <span className="tag-ex">예시</span>}</span>
        <h2 id="contestHeroTitle">{contestName(info.contestId)}</h2>
        <p>{dateText(info.startsAt)} 00시 ~ 다음 달 1일 00시 · <b>마감까지 {daysLeft}일</b>{mine?.alias ? <> · 내 별명 <b>{mine.alias}</b>{entry ? ` · ${BOARD_LABEL[entry.board]}` : ''}</> : ''}</p>
        <p className="contest-hero-lead">배치고사로 시작 판을 정하고, 가상 종목 매매로 가만히 있을 때보다 얼마나 더 버는지 겨뤄요.</p>
      </div>
      {view === 'home' && <div className="contest-hero-cta">
        {!member ? <button className="btn" type="button" onClick={() => openLogin(location.pathname)}>로그인하고 참가하기</button>
          : !entry ? <button className="btn" type="button" onClick={() => void beginPlacement()} disabled={busy}>{busy ? '문제 준비 중…' : '배치고사 보기'}</button>
          : <button className="btn" type="button" onClick={() => setView('play')} disabled={busy || entry.liquidated || entry.today.roundsLeft === 0}>{entry.liquidated ? '이번 대회 청산' : entry.today.roundsLeft === 0 ? '오늘 판을 모두 했어요' : `판 시작 · 오늘 ${entry.today.roundsLeft}판 남음`}</button>}
      </div>}
    </section>
    {/* 참가한 뒤에만 판 블록을 히어로 아래에 둔다. 참가 전에는 배치고사 카드 안의 시작 판 기준으로 보인다 */}
    {entry && <BoardChips info={info} mine={entry.board} />}
    {error && <div className="practice-error" role="alert"><p>{error}</p><button className="btn btn-sm" onClick={() => { setError(''); void load(); }}>다시 불러오기</button></div>}


    {view === 'placement' && placement ? <PlacementForm placement={placement} busy={busy} error={error} onSubmit={answers => void submit(answers)} onBack={() => setView('home')} />
      : view === 'result' && result ? <PlacementDone result={result} onStart={() => setView('home')} />
      : !member ? <section className="contest-card contest-join">
        <h2>회원만 참가할 수 있어요</h2>
        <p className="practice-muted">로그인하면 배치고사로 시작 판을 정하고, 대회 잔액으로 가상 시뮬레이션을 이어 하며 판별 순위로 겨룰 수 있어요. 랭킹도 회원만 볼 수 있어요.</p>
        <button className="btn btn-primary" type="button" onClick={() => openLogin(location.pathname)}>로그인하고 참가하기</button>
        <PlacementBoards info={info} />
      </section>
      : !entry ? <><section className="contest-card contest-join">
        <h2>배치고사로 시작해요</h2>
        <p className="practice-muted">실제 과거 공시 {info.rules.placementQuestions}개를 보고 그 뒤 5거래일 동안 주가가 오를지 내릴지 골라요. 30분 안에 제출하면 맞힌 수로 1천만·5천만·1억 판 중 시작 판이 정해져요. 시즌마다 한 번만 볼 수 있어요.</p>
        <button className="btn btn-primary" type="button" onClick={() => void beginPlacement()} disabled={busy}>{busy ? '문제 준비 중…' : '배치고사 보기'}</button>
        <PlacementBoards info={info} />
      </section>
        {rankingCard}</>
      : <><Dashboard entry={entry} busy={busy} onPlay={() => setView('play')} />
        {rankingCard}
        <details className="contest-card contest-fold">
          <summary><h2>내 판 기록</h2><span>{entry.recentRounds.length ? `최근 ${entry.recentRounds.length}판 · 펼쳐 보기` : '아직 판이 없어요'}</span></summary>
          <RoundHistory entry={entry} />
        </details></>}


    {member && view === 'home' && !!mine?.history.length && <section className="contest-card" aria-labelledby="contestHistoryTitle">
      <h2 id="contestHistoryTitle">지난 대회</h2>
      <ul className="contest-history">{mine.history.map(h => <li key={h.contestId}>
        <b>{contestName(h.contestId)}</b>
        <span>{BOARD_LABEL[h.finalBoard]} {fmt.format(h.participants)}명 중 {fmt.format(h.rank)}위{h.liquidated ? ' · 청산' : ''}</span>
        <span>판 점수 {points(h.boardPoints)} · 매매 성과 평균 {h.excessRate == null ? '—' : <span className={tone(h.excessRate)}>{pp(h.excessRate)}</span>} · {money(h.balance)}</span>
        <small>배치 {BOARD_LABEL[h.placementBoard]} · 최고 {BOARD_LABEL[h.highestBoard]} · {fmt.format(h.rounds)}판</small>
      </li>)}</ul>
      <p className="practice-muted">지난 대회 기록은 대회가 끝나고 12개월 동안 보관해요.</p>
    </section>}

    <Rules info={info} />
    <p className="practice-footnote">가상 종목·가상 사건으로 겨루는 대회예요. 실제 기업이 아니고, 대회 순위·점수는 앞으로의 수익을 뜻하지 않으며 투자 권유가 아니에요. 배당·세금·수수료는 제외했어요.</p>
  </div>;
}
