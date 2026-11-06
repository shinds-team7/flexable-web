import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { useLoginModal } from '@/components/LoginModal';
import {
  BOARD_LABEL, BOARDS, getContest, getMyContests, getRanking, startPlacement, submitPlacement,
  type ContestBoard, type ContestEntry, type ContestInfo, type ContestMine, type ContestPlacement, type ContestPlacementResult, type ContestRanking,
  type ContestRankingRow, type ContestResult, type Prediction,
} from '@/data/virtualContest';
import { getVirtualSimStatus } from '@/data/virtualSim';
import { CountUp } from '@/components/CountUp';
import { ApiError, errorText } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/motion';
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
      <li>하루에 {r.roundsPerDay}판까지 할 수 있어요. 하루 점수는 그날 판들의 매매 성과 평균으로 정해요. 매매 성과는 내 판 수익률에서 같은 가격 흐름에 사건마다 가만히(유지) 있었을 때의 수익률을 뺀 값이에요(예: 내 판 +11.07%, 가만히 +9.27%면 +1.80%p). 평균이 {pp(r.dailyTargetRate)}에 못 미치면 −1이에요. 목표 이상이면 그날 {r.roundsForDailyScore}판을 모두 했을 때 +1, 덜 했으면 0이에요. 판을 안 한 날은 0이에요. 가만히만 있으면 0%p라 목표에 못 미쳐요.</li>
      <li>주(1~7일, 8~14일, 15~21일, 22~28일, 29일~말일) 점수 합이 {points(r.weeklyPromoteAt)} 이상이면 한 단계 승급, {points(r.weeklyDemoteAt)} 이하면 한 단계 강등이에요. 판이 바뀌면 잔액은 새 판의 대회 시드머니로 다시 시작해요.</li>
      <li>판이 끝난 뒤 잔액이 {money(r.liquidationBelow)} 미만이면 이번 시즌은 청산되어 더 할 수 없어요.</li>
      <li>순위는 판 점수 → 매매 성과 평균 → 그 값에 먼저 도달한 순서로 정하고, 판별 상위 {r.rankingTop}위와 내 순위를 회원만 봐요. 이름 대신 서버가 붙인 별명이 보여요.</li>
      <li>판을 그만두거나 창을 닫으면 남은 사건은 유지로 보고 끝까지 계산해 잔액에 반영해요.</li>
    </ul>
  </details>;
}

/** 배치고사 맞힌 수 → 시작 판(서버 규칙 placementCuts). 참가 전 배치고사 카드 오른쪽에 짧은 표로 둔다. 판별 참가자 수는 참여 현황 카드에 있다 */
function PlacementBoards({ info }: { info: ContestInfo }) {
  const { B50M, B100M } = info.rules.placementCuts, total = info.rules.placementQuestions;
  const range: Record<ContestBoard, string> = { B10M: `0~${B50M - 1}개`, B50M: `${B50M}~${B100M - 1}개`, B100M: `${B100M}~${total}개` };
  return <div className="contest-placement-boards">
    <span className="contest-placement-boards-title">맞힌 수로 정하는 시작 판</span>
    <ol aria-label="맞힌 수로 정해지는 시작 판">
      {info.boards.map(b => <li key={b.board}><span>{range[b.board]}</span><b>{BOARD_LABEL[b.board]}</b><small>{money(b.seedMoney)}</small></li>)}
    </ol>
  </div>;
}

/** 참가 전 배치고사 카드: 왼쪽 설명·주 버튼, 오른쪽 시작 판 기준 */
function JoinCard({ info, title, text, action }: { info: ContestInfo; title: string; text: string; action?: ReactNode }) {
  const r = info.rules;
  return <section className="contest-card contest-join" aria-labelledby="contestJoinTitle">
    <div className="contest-join-main">
      <ul className="contest-join-facts" aria-label="배치고사 요약"><li>{r.placementQuestions}문제</li><li>30분</li><li>시즌마다 1번</li></ul>
      <h2 id="contestJoinTitle">{title}</h2>
      <p className="practice-muted">{text}</p>
      {action}
    </div>
    <PlacementBoards info={info} />
  </section>;
}

/** 대회 핵심 규칙 3줄(규칙 접기 위). 값은 서버 규칙 */
function RulesSummary({ info }: { info: ContestInfo }) {
  const r = info.rules;
  return <ul className="contest-rules-summary" aria-label="핵심 규칙">
    <li><b>하루 {r.roundsPerDay}판</b>까지 할 수 있어요</li>
    <li>그날 매매 성과 평균이 <b>목표 {pp(r.dailyTargetRate)}</b> 이상이면 +1점(10판을 모두 한 날), 못 미치면 −1점</li>
    <li>주 점수 <b>{points(r.weeklyPromoteAt)} 이상 승급 · {points(r.weeklyDemoteAt)} 이하 강등</b></li>
  </ul>;
}

/** 용어 풀이: 같은 설명을 카드마다 반복하지 않게 물음표에 둔다 */
const TERMS = {
  excess: { label: '매매 성과', tip: '내 판 수익률에서 같은 가격 흐름에 사건마다 가만히(유지) 있었을 때의 수익률을 뺀 값이에요. 두 수익률의 차이라 %p로 보여요.' },
  boardPoints: { label: '판 점수', tip: '지금 판에 들어온 뒤(배치고사 또는 승급·강등 뒤) 받은 하루 점수의 합이에요. 순위의 첫 기준이고, 판이 바뀌면 0부터 다시 세요.' },
  hold: { label: '가만히 있었다면', tip: '같은 판에서 사건마다 사고팔지 않고 유지만 했을 때의 수익률이에요. 매매 성과를 잴 때 기준이 돼요.' },
} as const;
type TermKey = keyof typeof TERMS;
function Term({ k, label }: { k: TermKey; label?: string }) {
  const id = useId();
  return <span className="contest-term">{label ?? TERMS[k].label}<span className="contest-tip-wrap">
    <button type="button" className="contest-tip-mark" aria-label={`${TERMS[k].label} 뜻`} aria-describedby={id}>?</button>
    <span id={id} role="tooltip" className="contest-tip">{TERMS[k].tip}</span>
  </span></span>;
}

/** 빈·오류·로딩 상태를 한 모양으로. 오류일 때만 [다시 시도] */
function StateBox({ kind, text, onRetry }: { kind: 'empty' | 'error' | 'loading'; text: string; onRetry?: () => void }) {
  return <div className={`contest-state ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
    <p>{text}</p>
    {kind === 'error' && onRetry && <button className="btn btn-sm" type="button" onClick={onRetry}>다시 시도</button>}
  </div>;
}

/** 처음 그린 다음 프레임에 true. 막대가 0에서 차오르는 전환에 쓴다(움직임 줄이기면 global.css가 전환을 끈다) */
function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => { const raf = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(raf); }, []);
  return on;
}

/** 지금 시각. ms 간격으로 다시 그린다 */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(t); }, [ms]);
  return now;
}

const kstDate = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(t);
const dayNo = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const pad = (n: number) => String(n).padStart(2, '0');

/** 마감까지 남은 시간: 하루 넘게 남으면 D-n, 마지막 하루는 hh:mm:ss. 화면 읽기 프로그램에는 분 단위 글만 둔다 */
function Countdown({ endsAt }: { endsAt: string }) {
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const lastDay = end - now <= 86400000;
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), lastDay ? 1000 : 60000); return () => window.clearInterval(t); }, [lastDay]);
  const left = Math.max(0, end - now);
  const sec = Math.floor(left / 1000);
  const shown = left === 0 ? '마감' : !lastDay ? `D-${Math.ceil(left / 86400000)}` : `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
  const spoken = left === 0 ? '이번 대회는 마감했어요' : !lastDay ? `마감까지 ${Math.ceil(left / 86400000)}일 남음` : `마감까지 ${Math.floor(sec / 3600)}시간 ${Math.floor(sec / 60) % 60}분 남음`;
  return <p className={`contest-countdown ${lastDay ? 'urgent' : ''}`} role="timer" aria-live="off">
    <span className="contest-countdown-label">마감까지</span>
    <strong aria-hidden="true">{shown}</strong>
    <span className="sr-only">{spoken}</span>
  </p>;
}

/** 대회 참여 현황(누구나): 전체·판별 참가자, 기간 진행, 남은 시간. 참가했으면 내 판·순위를 강조한다. 합계·비율은 서버 참가자 수를 더하고 나눠 보여 주기만 한다(내림) */
function Participation({ info, entry }: { info: ContestInfo; entry: ContestEntry | null }) {
  const mounted = useMounted();
  const now = useNow(60000);
  const total = info.boards.reduce((s, b) => s + b.participants, 0);
  const first = info.weeks[0].startsOn, last = info.weeks[info.weeks.length - 1].endsOn;
  const days = dayNo(last) - dayNo(first) + 1;
  const today = kstDate(now);
  const span = new Date(info.endsAt).getTime() - new Date(info.startsAt).getTime();
  const elapsed = Math.max(0, Math.min(1, (now - new Date(info.startsAt).getTime()) / span));
  const dayIndex = Math.max(1, Math.min(days, dayNo(today) - dayNo(first) + 1));
  const nowWeek = info.weeks.find(w => w.startsOn <= today && today <= w.endsOn)?.week ?? null;
  const topShare = entry ? Math.floor(entry.rank / entry.participants * 1000) / 10 : null;
  return <section className="contest-card contest-participation" aria-labelledby="contestJoinStatusTitle">
    <div className="contest-card-head">
      <h2 id="contestJoinStatusTitle">대회 참여 현황</h2>
      <Countdown endsAt={info.endsAt} />
    </div>
    <div className="contest-part-grid">
      <div>
        <p className="contest-part-total"><span>전체 참가자</span><strong>{fmt.format(total)}명</strong></p>
        <ul className="contest-part-boards" aria-label="판별 참가자">
          {info.boards.map(b => {
            const pct = total ? Math.floor(b.participants / total * 100) : 0;
            const mine = entry?.board === b.board;
            return <li key={b.board} className={mine ? 'mine' : ''} aria-current={mine ? 'true' : undefined}>
              <div className="contest-part-row">
                <b>{BOARD_LABEL[b.board]}</b>
                {mine ? <span className="contest-chip">내 판</span> : !b.available && <span className="contest-chip muted">준비 중</span>}
                <small>{money(b.seedMoney)}로 시작</small>
                <span className="contest-part-count">{fmt.format(b.participants)}명 · {pct}%</span>
              </div>
              <div className="contest-bar" aria-hidden="true"><span style={{ width: `${mounted ? pct : 0}%` }} /></div>
            </li>;
          })}
        </ul>
        {entry && topShare != null && <p className="contest-part-me">
          {BOARD_LABEL[entry.board]} <b>{fmt.format(entry.participants)}명 중 {fmt.format(entry.rank)}위</b> · {topShare >= 0.1 ? `상위 ${topShare.toFixed(1)}%` : '상위 0.1% 안'}
        </p>}
      </div>
      <div>
        <p className="contest-part-period"><span>{dateText(info.startsAt)} 시작</span><span>{dateText(info.endsAt)} 00시 마감</span></p>
        <div className="contest-period" role="img" aria-label={`대회 기간 ${days}일 중 ${dayIndex}일째${nowWeek ? `, 지금 ${nowWeek}주` : ''}`}>
          <div className="contest-period-weeks">
            {info.weeks.map(w => <span key={w.week} className={w.week === nowWeek ? 'now' : w.endsOn < today ? 'past' : ''} style={{ flexGrow: dayNo(w.endsOn) - dayNo(w.startsOn) + 1 }}>{w.week}주</span>)}
          </div>
          <div className="contest-period-track"><span style={{ width: `${(mounted ? elapsed : 0) * 100}%` }} /><i style={{ left: `${elapsed * 100}%` }} /></div>
        </div>
        <p className="practice-muted contest-part-note">{days}일 중 {dayIndex}일째{nowWeek ? ` · 지금 ${nowWeek}주(${dateText(info.weeks[nowWeek - 1].startsOn)}~${dateText(info.weeks[nowWeek - 1].endsOn)})` : ''}. 주가 끝날 때마다 주 점수로 승급·강등을 정해요.</p>
      </div>
    </div>
  </section>;
}

const GUIDE_KEY = 'fx.guide.contest';
const readGuide = () => { try { return localStorage.getItem(GUIDE_KEY); } catch { return null; } };
const saveGuide = (v: 'open' | 'closed') => { try { localStorage.setItem(GUIDE_KEY, v); } catch { /* 저장 못 해도 화면은 그대로 */ } };

/** 처음 온 사람 안내(대회 방식 3단계). 참가 전에는 펼치고, 참가한 뒤에는 접어 두며 펼침·접힘을 브라우저에 기억한다 */
function ContestGuide({ info, joined }: { info: ContestInfo; joined: boolean }) {
  const [stored, setStored] = useState(readGuide);
  const open = joined ? stored === 'open' : true;
  const r = info.rules;
  return <details className="contest-card contest-fold contest-guide" open={open} onToggle={e => {
    const now = e.currentTarget.open;
    if (!joined || now === open) return;
    const v = now ? 'open' : 'closed';
    setStored(v); saveGuide(v);
  }}>
    <summary><h2>대회는 이렇게 진행돼요</h2><span>{open ? '접기' : '펼쳐 보기'}</span></summary>
    <ol className="contest-steps">
      <li><span className="contest-step-no" aria-hidden="true">1</span><b>배치고사</b><small>실제 과거 공시 {r.placementQuestions}문제로 1천만·5천만·1억 판 중 시작 판을 정해요</small></li>
      <li><span className="contest-step-no" aria-hidden="true">2</span><b>하루 {r.roundsPerDay}판</b><small>가상 종목을 매매해 그날 매매 성과 평균이 {pp(r.dailyTargetRate)} 이상이면 +1점, 못 미치면 −1점</small></li>
      <li><span className="contest-step-no" aria-hidden="true">3</span><b>주 점수로 승급·강등</b><small>주 합이 {points(r.weeklyPromoteAt)} 이상이면 한 단계 위로, {points(r.weeklyDemoteAt)} 이하면 한 단계 아래로</small></li>
    </ol>
  </details>;
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

/** 내 대회 기록 카드 머리 아이콘(장식). 판 = 층 쌓기, 잔액 = 지갑, 매매 성과 = 오르는 선, 판 점수·순위 = 메달 */
function StatIcon({ kind }: { kind: 'board' | 'balance' | 'excess' | 'points' }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <span className="contest-stat-icon" aria-hidden="true"><svg viewBox="0 0 20 20" width="18" height="18">
    {kind === 'board' && <><path {...p} d="M10 3 17 6.5 10 10 3 6.5Z" /><path {...p} d="m3 10 7 3.5 7-3.5" /><path {...p} d="m3 13.5 7 3.5 7-3.5" /></>}
    {kind === 'balance' && <><rect {...p} x="2.5" y="5" width="15" height="11" rx="2" /><path {...p} d="M2.5 8h15" /><circle cx="13.5" cy="12" r="1.2" fill="currentColor" /></>}
    {kind === 'excess' && <><path {...p} d="M3 16.5h14" /><path {...p} d="m3.5 13 4-4 3 2.5 5.5-6" /><path {...p} d="M12.5 5.5H16V9" /></>}
    {kind === 'points' && <><circle {...p} cx="10" cy="12" r="4.5" /><path {...p} d="M7 3h6l-1.5 4.6M7 3l1.5 4.6" /><path {...p} d="m10 9.8.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2Z" /></>}
  </svg></span>;
}

/** 대회 배너 그림(장식): 오르는 차트 위 트로피. 색은 배너 글자색(흰색) 한 가지의 투명도만 쓴다 */
function HeroArt() {
  return <svg className="contest-hero-art" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
    <g fill="currentColor">
      <rect x="18" y="104" width="18" height="34" rx="3" opacity=".22" />
      <rect x="44" y="90" width="18" height="48" rx="3" opacity=".28" />
      <rect x="70" y="96" width="18" height="42" rx="3" opacity=".22" />
      <rect x="96" y="74" width="18" height="64" rx="3" opacity=".32" />
      <rect x="122" y="60" width="18" height="78" rx="3" opacity=".38" />
    </g>
    <path d="M12 112 L40 96 L66 102 L94 78 L120 66 L150 46" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
    <path d="M140 42 L152 44 L148 55" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
    <path d="M8 138 H232" stroke="currentColor" strokeWidth="2" opacity=".3" />
    <g transform="translate(162 18)">
      <circle cx="34" cy="44" r="40" fill="currentColor" opacity=".12" />
      <path d="M14 12 H54 V30 a20 20 0 0 1 -40 0 Z" fill="currentColor" opacity=".95" />
      <path d="M14 18 H5 a9 11 0 0 0 11 15 M54 18 H63 a9 11 0 0 1 -11 15" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".95" />
      <rect x="30" y="49" width="8" height="14" fill="currentColor" opacity=".95" />
      <rect x="20" y="63" width="28" height="8" rx="2" fill="currentColor" opacity=".95" />
      <path d="m34 20 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" className="contest-hero-art-star" />
    </g>
  </svg>;
}

/** 최근 7일 하루 점수 미니 막대(+1 빨강 / −1 파랑 / 0 회색). scoredDays는 최신순이라 뒤집어 왼쪽이 오래된 날 */
function ScoredDaysBars({ days }: { days: ContestEntry['scoredDays'] }) {
  const recent = days.slice(0, 7).reverse();
  if (!recent.length) return null;
  return <div className="contest-days">
    <span className="contest-days-label">최근 {recent.length}일 하루 점수</span>
    <ol aria-label={`최근 ${recent.length}일 하루 점수`}>
      {recent.map((d, i) => <li key={d.date} className={d.points > 0 ? 'up' : d.points < 0 ? 'down' : 'zero'} style={{ animationDelay: `${i * 60}ms` }}>
        <span className="contest-days-bar" aria-hidden="true" />
        <small aria-hidden="true">{Number(d.date.slice(8))}</small>
        <span className="sr-only">{dateText(d.date)} {points(d.points)}{d.rounds ? ` · ${d.rounds}판` : ' · 판 없음'}</span>
      </li>)}
    </ol>
  </div>;
}

/** 이번 주 승급·강등까지 남은 점수(서버 주 점수와 규칙 값의 차이를 보여 주기만 한다) */
function weekGap(entry: ContestEntry, rules: ContestInfo['rules']) {
  const w = entry.week;
  if (w.week === 5) return '29일부터의 짧은 주는 판이 바뀌지 않아요.';
  const promote = entry.board === 'B100M' ? '1억 판은 승급 없음' : w.points >= rules.weeklyPromoteAt ? '승급 기준 도달' : `승급까지 ${rules.weeklyPromoteAt - w.points}점`;
  const demote = entry.board === 'B10M' ? '1천만 판은 강등 없음' : w.points <= rules.weeklyDemoteAt ? '강등 기준 도달' : `강등까지 ${w.points - rules.weeklyDemoteAt}점`;
  return `${promote} · ${demote}`;
}

function Dashboard({ info, entry, onPlay, busy }: { info: ContestInfo; entry: ContestEntry; onPlay: () => void; busy: boolean }) {
  const mounted = useMounted();
  const t = entry.today, w = entry.week, change = entry.lastBoardChange, rules = info.rules;
  const up = change ? BOARDS.indexOf(change.to) > BOARDS.indexOf(change.from) : false;
  const rate = t.returnRate;
  const meter = rate == null ? 0 : Math.min(1, Math.abs(rate) / t.targetRate);
  const nowCell = Math.max(rules.weeklyDemoteAt, Math.min(rules.weeklyPromoteAt, w.points));
  const cells = Array.from({ length: rules.weeklyPromoteAt - rules.weeklyDemoteAt + 1 }, (_, i) => rules.weeklyDemoteAt + i);
  const nextStart = dateText(info.endsAt);
  return <>
    {change && <div className={`contest-banner contest-enter-in ${up ? 'up' : 'down'}`} role="status"><b>{up ? '승급' : '강등'}</b> 주 점수 {points(change.weekPoints)}로 {BOARD_LABEL[change.from]}에서 {BOARD_LABEL[change.to]}{up ? '으로 올라왔어요' : '으로 내려왔어요'}. 잔액은 새 판의 대회 시드머니로 다시 시작했어요. <small>{dateText(change.at)}</small></div>}
    {entry.liquidated && <div className="contest-banner contest-enter-in down" role="status"><b>청산</b> 잔액이 {money(rules.liquidationBelow)} 미만으로 끝나 이번 대회는 더 할 수 없어요. 지금 판·점수로 순위에 남아요.</div>}
    <div className="contest-grid">
      <section className="contest-card contest-today" aria-labelledby="contestTodayTitle">
        <h2 id="contestTodayTitle">오늘 목표 <small>오늘 {t.rounds}/{rules.roundsPerDay}판</small></h2>
        <p className="contest-big">{rate == null ? (t.rounds ? '오늘 끝낸 판이 아직 없어요' : '오늘 아직 판을 하지 않았어요') : <>오늘 <Term k="excess" /> 평균 <b className={tone(rate)}>{pp(rate)}</b> · 목표 {pp(t.targetRate)} 이상</>}</p>
        {/* 0을 가운데 두고 오른쪽 끝이 목표, 왼쪽 끝이 −목표. 마이너스면 왼쪽으로 파랗게 찬다(서버 값을 비율로 보여 주기만 한다) */}
        <div className="contest-meter" role="img" aria-label={rate == null ? '오늘 끝낸 판이 없어요' : `오늘 매매 성과 평균 ${pp(rate)}, 목표 ${pp(t.targetRate)}${rate < 0 ? ', 마이너스예요' : ''}`}>
          <div className="contest-meter-track">
            <span className={`contest-meter-fill ${rate != null && rate < 0 ? 'down' : 'up'}`} style={{ width: `${(mounted ? meter : 0) * 50}%` }} />
            <i className="contest-meter-zero" />
          </div>
          <div className="contest-meter-scale" aria-hidden="true"><span>{pp(-t.targetRate)}</span><span>0</span><span>목표 {pp(t.targetRate)}</span></div>
        </div>
        {rate != null && <p className={`contest-meter-note ${rate < 0 ? 'practice-fall' : rate >= t.targetRate ? 'practice-rise' : ''}`}>
          {rate >= t.targetRate ? '오늘 목표 이상이에요' : rate < 0 ? `▼ 가만히 있었을 때보다 ${pp(Math.abs(rate)).slice(1)} 낮아요. 목표까지 ${pp(t.targetRate - rate)}` : `목표까지 ${pp(t.targetRate - rate)}`}
        </p>}
        <p className="practice-muted">{`그날 평균이 ${pp(t.targetRate)}에 못 미치면 −1점, 목표 이상이면 ${rules.roundsForDailyScore}판을 모두 했을 때 +1점(덜 했으면 0점)이에요. 판을 안 한 날은 0점이에요.`}</p>
        {entry.liquidated ? <div className="contest-cta-done"><b>이번 대회는 청산으로 끝났어요</b><span>다음 대회는 {nextStart} 00시에 배치고사로 시작해요.</span></div>
          : t.roundsLeft === 0 ? <div className="contest-cta-done"><b>오늘 {rules.roundsPerDay}판을 모두 했어요</b><span>내일 00시에 다시 할 수 있어요. 이번 대회는 {nextStart} 00시에 마감하고 다음 대회가 시작해요.</span></div>
          : <div className="contest-play">
            <span><b>{t.roundsLeft}판 남음</b></span>
            <button className="btn btn-primary" type="button" onClick={onPlay} disabled={busy}>{entry.activeRound ? '진행 중인 판 대신 새 판 시작' : '판 시작'}</button>
          </div>}
        {entry.activeRound && !entry.liquidated && t.roundsLeft > 0 && <p className="practice-muted">진행 중인 판이 있어요. 새 판을 시작하면 그 판은 남은 사건을 유지로 보고 정산해요.</p>}
      </section>
      <section className="contest-card" aria-labelledby="contestWeekTitle">
        <h2 id="contestWeekTitle">이번 주 점수 <small>{w.week}주 · {dateText(w.endsOn)}까지</small></h2>
        <p className="contest-big"><b>{points(w.points)}</b> <span className="contest-week-gap">{weekGap(entry, rules)}</span></p>
        <div className="contest-week" role="img" aria-label={`이번 주 ${points(w.points)}, ${points(rules.weeklyDemoteAt)}부터 ${points(rules.weeklyPromoteAt)}까지`}>
          {cells.map(n => {
            const filled = mounted && (w.points > 0 ? n > 0 && n <= nowCell : w.points < 0 ? n < 0 && n >= nowCell : false);
            return <span key={n} className={[n === nowCell ? 'now' : '', filled ? (n > 0 ? 'fill up' : 'fill down') : '', n === rules.weeklyPromoteAt ? 'promote' : n === rules.weeklyDemoteAt ? 'demote' : ''].filter(Boolean).join(' ')}
              style={{ transitionDelay: `${Math.abs(n) * 60}ms` }}>{n}</span>;
          })}
        </div>
        <ScoredDaysBars days={entry.scoredDays} />
      </section>
    </div>
    <section className="contest-stats" aria-label="내 대회 기록">
      <div className="contest-stat"><span><StatIcon kind="board" />지금 판</span><strong>{BOARD_LABEL[entry.board]}</strong><small>대회 시드머니 {money(entry.seedMoney)}</small></div>
      <div className="contest-stat"><span><StatIcon kind="balance" />현재 잔액</span><strong><CountUp value={entry.balance} format={money} /></strong><small className={tone(entry.profit)}>불린 금액 {signed(entry.profit)}</small></div>
      <div className="contest-stat"><span><StatIcon kind="excess" /><Term k="excess" label="매매 성과 평균" /></span><strong className={tone(entry.excessRate ?? 0)}>{entry.excessRate == null ? '—' : <CountUp value={entry.excessRate} format={pp} decimals={4} />}</strong><small>판 수익률 {percent(entry.returnRate)} · 끝낸 판 {fmt.format(entry.rounds)}판</small></div>
      <div className="contest-stat"><span><StatIcon kind="points" /><Term k="boardPoints" /> · 순위</span><strong><CountUp value={entry.boardPoints} format={points} /></strong><small>{fmt.format(entry.participants)}명 중 {fmt.format(entry.rank)}위</small></div>
    </section>
  </>;
}

const END_REASON: Record<string, string> = { COMPLETED: '완주', ENDED: '그만둠', EXPIRED: '시간 만료', RESTARTED: '서버 재시작', REPLACED: '새 판 시작', CLOSED: '대회 마감' };

/** 내 판 기록: 날짜별로 묶고, 하루 점수를 정한 날은 그날 점수·평균을 함께 보인다(모두 서버 값) */
function RoundHistory({ entry }: { entry: ContestEntry }) {
  if (!entry.recentRounds.length) return <StateBox kind="empty" text="아직 한 판이 없어요. 판을 끝내면 여기에 결과가 쌓여요." />;
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
          <thead><tr><th scope="col">판</th><th scope="col">끝난 방식</th><th scope="col" className="num">내 판</th><th scope="col" className="num"><Term k="hold" /></th><th scope="col" className="num"><Term k="excess" /></th><th scope="col" className="num">끝 잔액</th></tr></thead>
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

const RANK_PAGE = 20;

/** 1~3위 시상대(별명·판 점수·매매 성과 평균, 서버 값) */
function Podium({ rows }: { rows: ContestRankingRow[] }) {
  const top = rows.filter(r => r.rank <= 3).slice(0, 3);
  if (!top.length) return null;
  return <ol className="contest-podium" aria-label="1~3위">
    {top.map(r => <li key={`${r.rank}-${r.alias}`} className={`p${r.rank}${r.isMe ? ' me' : ''}${r.liquidated ? ' liquidated' : ''}`}>
      <span className="contest-podium-rank">{r.rank}<small>위</small></span>
      <b>{r.alias}{r.isMe && <span className="contest-chip">나</span>}</b>
      <span>판 점수 <strong>{points(r.boardPoints)}</strong></span>
      <small>매매 성과 평균 <span className={tone(r.excessRate ?? 0)}>{r.excessRate == null ? '—' : pp(r.excessRate)}</span></small>
    </li>)}
  </ol>;
}

function RankingSkeleton() {
  return <div className="contest-table-wrap" aria-hidden="true">
    <table className="contest-table contest-rank"><tbody>
      {Array.from({ length: 6 }, (_, i) => <tr key={i}>{[28, 120, 48, 72, 96, 32].map((w, j) => <td key={j} className={j >= 4 ? 'opt' : ''}><span className="skel contest-skel" style={{ width: w }} /></td>)}</tr>)}
    </tbody></table>
  </div>;
}

function RankingTable({ ranking, expanded, onExpand, meRef }: { ranking: ContestRanking; expanded: boolean; onExpand: (v: boolean) => void; meRef: RefObject<HTMLTableRowElement | null> }) {
  const row = (r: ContestRankingRow) => <tr key={`${r.rank}-${r.alias}`} ref={r.isMe ? meRef : undefined} tabIndex={r.isMe ? -1 : undefined}
    className={[r.isMe ? 'me' : '', r.liquidated ? 'liquidated' : ''].filter(Boolean).join(' ')}>
    <td className="num">{fmt.format(r.rank)}</td>
    <td className="contest-rank-alias">{r.alias}{r.isMe && <span className="contest-chip">나</span>}{r.liquidated && <span className="contest-chip muted">청산</span>}</td>
    <td className="num">{points(r.boardPoints)}</td>
    <td className={`num ${tone(r.excessRate ?? 0)}`}>{r.excessRate == null ? '—' : pp(r.excessRate)}</td>
    <td className="num opt">{money(r.balance)}</td>
    <td className="num opt">{fmt.format(r.rounds)}</td>
  </tr>;
  const shown = expanded ? ranking.items : ranking.items.slice(0, RANK_PAGE);
  const meOutside = ranking.me && !ranking.items.some(r => r.isMe) ? ranking.me : null;
  const more = ranking.items.length - RANK_PAGE;
  return <>
    <div className={`contest-table-wrap ${expanded && ranking.items.length > RANK_PAGE ? 'tall' : ''}`}>
      <table className="contest-table contest-rank">
        <caption className="sr-only">{BOARD_LABEL[ranking.board]} 순위, {ranking.status === 'SETTLED' ? '확정' : '지금 기준'}, 참가자 {fmt.format(ranking.participants)}명</caption>
        <thead><tr><th scope="col" className="num">순위</th><th scope="col">별명</th><th scope="col" className="num">판 점수</th><th scope="col" className="num">매매 성과 평균</th><th scope="col" className="num opt">잔액</th><th scope="col" className="num opt">판 수</th></tr></thead>
        <tbody>
          {shown.map(row)}
          {meOutside && <tr className="contest-rank-gap" aria-hidden="true"><td colSpan={6}>⋯</td></tr>}
          {meOutside && row(meOutside)}
        </tbody>
      </table>
    </div>
    {more > 0 && <button type="button" className="btn btn-sm contest-more" aria-expanded={expanded} onClick={() => onExpand(!expanded)}>{expanded ? `${RANK_PAGE}위까지만 보기` : `더 보기 · ${fmt.format(more)}명 더`}</button>}
  </>;
}

/** 지난 대회: 배치 판 → 최고 판 → 최종 판 흐름 카드 */
function HistoryCards({ history }: { history: ContestResult[] }) {
  return <ul className="contest-history">{history.map(h => <li key={h.contestId}>
    <div className="contest-history-head"><b>{contestName(h.contestId)}</b>{h.liquidated && <span className="contest-chip muted">청산</span>}</div>
    <ol className="contest-flow" aria-label="판 흐름">
      <li><small>배치</small>{BOARD_LABEL[h.placementBoard]}</li>
      <li><small>최고</small>{BOARD_LABEL[h.highestBoard]}</li>
      <li className="final"><small>최종</small>{BOARD_LABEL[h.finalBoard]}</li>
    </ol>
    <p><b>{fmt.format(h.participants)}명 중 {fmt.format(h.rank)}위</b> · 판 점수 {points(h.boardPoints)}</p>
    <small>매매 성과 평균 {h.excessRate == null ? '—' : <span className={tone(h.excessRate)}>{pp(h.excessRate)}</span>} · {money(h.balance)} · {fmt.format(h.rounds)}판</small>
  </li>)}</ul>;
}

/** 판이 끝나고 돌아왔을 때 보일 짧은 피드백. 모두 서버 값이고 순위·오늘 평균은 이전 응답과 나란히 보여 주기만 한다 */
function roundFeedback(before: ContestEntry, after: ContestEntry) {
  const settledBefore = new Set(before.recentRounds.filter(r => r.status === 'SETTLED').map(r => r.roundNumber));
  const fresh = after.recentRounds.find(r => r.status === 'SETTLED' && !settledBefore.has(r.roundNumber));
  if (!fresh) return null;
  const parts = [fresh.excessRate == null ? '방금 판을 정산했어요' : `방금 판 매매 성과 ${pp(fresh.excessRate)}`];
  const a = after.today.returnRate, b = before.today.returnRate;
  if (a != null && a !== b) parts.push(`오늘 평균 ${b == null ? '—' : pp(b)} → ${pp(a)}`);
  if (after.board === before.board && after.rank !== before.rank) parts.push(`순위 ${fmt.format(before.rank)}위 → ${fmt.format(after.rank)}위`);
  return parts.join(' · ');
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
  const [rankingState, setRankingState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rankingTry, setRankingTry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [jumpToMe, setJumpToMe] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const beforePlay = useRef<ContestEntry | null>(null);
  const meRow = useRef<HTMLTableRowElement | null>(null);
  const tabs = useRef<Record<ContestBoard, HTMLButtonElement | null>>({ B10M: null, B50M: null, B100M: null });

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

  // 판별 랭킹(회원만). 판을 바꾸면 불러오는 동안 스켈레톤 행을 보인다
  useEffect(() => {
    if (!member || !info || !board || view === 'play') return;
    let alive = true;
    setRankingState(s => (ranking?.board === board && s === 'ready' ? s : 'loading'));
    getRanking(info.contestId, board)
      .then(r => { if (alive) { setRanking(r); setRankingState('ready'); } })
      .catch(() => { if (alive) setRankingState('error'); });
    return () => { alive = false; };
    // ranking은 같은 판 다시 불러오기에서 스켈레톤을 띄우지 않으려고 읽기만 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, info, board, view, mine, rankingTry]);
  useEffect(() => { setExpanded(false); }, [board]);

  // [내 순위로 이동]: 접힌 목록 밖이면 펼친 뒤 내 행으로 옮기고 포커스를 둔다
  useEffect(() => {
    if (!jumpToMe) return;
    const row = meRow.current;
    if (!row) return;
    row.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    row.focus({ preventScroll: true });
    setJumpToMe(false);
  }, [jumpToMe, expanded, ranking]);

  // 판이 끝나고 돌아오면 방금 판 결과를 짧게 알린다(서버 값만)
  useEffect(() => {
    const before = beforePlay.current, after = mine?.current;
    if (view !== 'home' || !before || !after) return;
    const text = roundFeedback(before, after);
    if (text) { setToast(text); beforePlay.current = null; }
  }, [mine, view]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

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

  if (!info) return <section className="contest-card">{error ? <StateBox kind="error" text={error} onRetry={() => void load()} /> : <StateBox kind="loading" text="대회 정보를 불러오는 중…" />}</section>;

  const entry = mine?.current ?? null;
  if (view === 'play' && entry) {
    return <VirtualSimulation active={active} onGoPast={exit} contest={{ board: entry.board, today: entry.today, onSettled: settled, onExit: exit }} />;
  }
  const play = () => { beforePlay.current = entry; setToast(''); setView('play'); };
  const tabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!board) return;
    const i = BOARDS.indexOf(board);
    const next = e.key === 'ArrowRight' ? BOARDS[(i + 1) % BOARDS.length] : e.key === 'ArrowLeft' ? BOARDS[(i + BOARDS.length - 1) % BOARDS.length]
      : e.key === 'Home' ? BOARDS[0] : e.key === 'End' ? BOARDS[BOARDS.length - 1] : null;
    if (!next) return;
    e.preventDefault(); setBoard(next); tabs.current[next]?.focus();
  };
  const goToMe = () => {
    if (ranking?.me && ranking.items.findIndex(r => r.isMe) >= RANK_PAGE) setExpanded(true);
    setJumpToMe(true);
  };

  // 판별 랭킹(회원만). 배치고사 전에는 미리보기로 보인다
  const rankingCard = <section className="contest-card" aria-labelledby="contestRankTitle">
    <div className="contest-card-head">
      <h2 id="contestRankTitle">판별 랭킹 {ranking && rankingState === 'ready' && <small>{ranking.status === 'SETTLED' ? '확정' : '지금 기준'} · 참가 {fmt.format(ranking.participants)}명</small>}</h2>
      <div className="contest-rank-tools">
        {ranking?.me && rankingState === 'ready' && <button type="button" className="btn btn-sm" onClick={goToMe}>내 순위로 이동</button>}
        <div className="contest-seg" role="tablist" aria-label="판 고르기">{BOARDS.map(b => <button key={b} type="button" role="tab" id={`contestRankTab-${b}`} aria-controls="contestRankPanel"
          ref={el => { tabs.current[b] = el; }} aria-selected={board === b} tabIndex={board === b ? 0 : -1} className={board === b ? 'selected' : ''}
          onClick={() => setBoard(b)} onKeyDown={tabKey}>{BOARD_LABEL[b]}</button>)}</div>
      </div>
    </div>
    <div id="contestRankPanel" role="tabpanel" aria-labelledby={board ? `contestRankTab-${board}` : undefined} aria-busy={rankingState === 'loading'}>
      {rankingState === 'error' ? <StateBox kind="error" text="랭킹을 불러오지 못했어요." onRetry={() => setRankingTry(n => n + 1)} />
        : rankingState === 'loading' || !ranking ? <><span className="sr-only">랭킹을 불러오는 중</span><RankingSkeleton /></>
        : !ranking.items.length ? <StateBox kind="empty" text="아직 이 판에 참가자가 없어요." />
        : <><Podium rows={ranking.items} /><RankingTable ranking={ranking} expanded={expanded} onExpand={setExpanded} meRef={meRow} /></>}
    </div>
    <p className="practice-muted">판 점수가 같으면 지금 판에서 끝낸 판들의 매매 성과 평균이 높은 순이에요. 별명 외의 회원 정보는 보이지 않아요.</p>
  </section>;

  const home = view === 'home';
  return <div className="contest">
    {onExit && <button type="button" className="contest-back" onClick={onExit}>← 자유 연습으로</button>}
    <section className="contest-hero" aria-labelledby="contestHeroTitle">
      <div className="contest-hero-body">
        <span className="contest-hero-kicker">회원 월간 대회 · 진행 중{sample && <span className="tag-ex">예시</span>}</span>
        <h2 id="contestHeroTitle">{contestName(info.contestId)}</h2>
        <p>{dateText(info.startsAt)} 00시 ~ {dateText(info.endsAt)} 00시{mine?.alias ? <> · 내 별명 <b>{mine.alias}</b>{entry ? ` · ${BOARD_LABEL[entry.board]}` : ''}</> : ''}</p>
        <p className="contest-hero-lead">배치고사로 시작 판을 정하고, 가상 종목 매매로 가만히 있을 때보다 얼마나 더 버는지 겨뤄요.</p>
        {/* 주 행동은 상태마다 하나: 비회원은 여기 로그인, 배치고사 전은 배치고사 카드, 참가 중은 오늘 목표 카드 */}
        {home && !member && <div className="contest-hero-cta"><button className="btn" type="button" onClick={() => openLogin(location.pathname)}>로그인하고 참가하기</button></div>}
      </div>
      <HeroArt />
    </section>
    {error && <StateBox kind="error" text={error} onRetry={() => { setError(''); void load(); }} />}

    {view === 'placement' && placement ? <PlacementForm placement={placement} busy={busy} error={error} onSubmit={answers => void submit(answers)} onBack={() => setView('home')} />
      : view === 'result' && result ? <PlacementDone result={result} onStart={() => setView('home')} />
      : !member ? <>
        <ContestGuide info={info} joined={false} />
        <Participation info={info} entry={null} />
        <JoinCard info={info} title="회원만 참가할 수 있어요" text="로그인하면 배치고사로 시작 판을 정하고 판별 순위로 겨뤄요. 랭킹도 회원만 볼 수 있어요." /></>
      : !entry ? <>
        <JoinCard info={info} title="배치고사로 시작해요" text="실제 과거 공시를 보고 그 뒤 5거래일 동안 주가가 오를지 내릴지 골라요. 맞힌 수로 시작 판이 정해져요."
          action={<button className="btn btn-primary" type="button" onClick={() => void beginPlacement()} disabled={busy}>{busy ? '문제 준비 중…' : '배치고사 보기'}</button>} />
        <Participation info={info} entry={null} />
        <ContestGuide info={info} joined={false} />
        {rankingCard}</>
      : <><Dashboard info={info} entry={entry} busy={busy} onPlay={play} />
        <Participation info={info} entry={entry} />
        {rankingCard}
        <details className="contest-card contest-fold">
          <summary><h2>내 판 기록</h2><span>{entry.recentRounds.length ? `최근 ${entry.recentRounds.length}판 · 펼쳐 보기` : '아직 판이 없어요'}</span></summary>
          <RoundHistory entry={entry} />
        </details>
        <ContestGuide info={info} joined /></>}

    {member && home && !!mine?.history.length && <section className="contest-card" aria-labelledby="contestHistoryTitle">
      <h2 id="contestHistoryTitle">지난 대회</h2>
      <HistoryCards history={mine.history} />
      <p className="practice-muted">지난 대회 기록은 대회가 끝나고 12개월 동안 보관해요.</p>
    </section>}

    <RulesSummary info={info} />
    <Rules info={info} />
    <p className="practice-footnote">가상 종목·가상 사건으로 겨루는 대회예요. 실제 기업이 아니고, 대회 순위·점수는 앞으로의 수익을 뜻하지 않으며 투자 권유가 아니에요. 배당·세금·수수료는 제외했어요.</p>
    {toast && <div className="toast contest-toast" role="status"><span>{toast}</span><button type="button" aria-label="알림 닫기" onClick={() => setToast('')}>×</button></div>}
  </div>;
}
