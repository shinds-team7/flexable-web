import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { useLoginModal } from '@/components/LoginModal';
import {
  BOARD_LABEL, BOARDS, getContest, getMyContests, getRanking, startPlacement, submitPlacement,
  type ContestBoard, type ContestEntry, type ContestInfo, type ContestMine, type ContestPlacement, type ContestPlacementResult, type ContestRanking,
  type ContestRankingRow, type ContestResult, type Prediction,
} from '@/data/virtualContest';
import { getVirtualSimStatus } from '@/data/virtualSim';
import { CATEGORY_GUIDE, SUBSIDIARY_NOTE, cleanTitle } from '@/data/placementGuide';
import { clearPlacement, markPlacement } from '@/data/placementMark';
import { disclosureStory, questionStory, typeReading } from '@/data/disclosureStory';
import { CountUp } from '@/components/CountUp';
import { Reveal } from '@/components/Reveal';
import { Term } from '@/components/TermTip';
import { LeagueEmblem } from '@/components/LeagueEmblem';
import { ApiError, errorText } from '@/lib/api';
import { prefersReducedMotion } from '@/lib/motion';
import { VirtualSimulation } from '@/pages/VirtualSimulation';
import '@/styles/contest.css';

// 가상 시뮬레이션 대회(decisions/2026-11-05-virtual-sim-contest, policies §8-8). 회원만 참가하고 대회 안내만 누구나 본다.
// 금액·수익률·점수·순위는 서버 값을 그대로 보인다(화면에서 다시 계산하지 않는다). 판 진행은 가상 시뮬레이션 화면을 대회 판으로 쓴다.
// 화면 뼈대(02-design §5-14, decisions/2026-11-11-contest-ux-redesign): 머리 줄 → 상태 배너 → 오늘 할 일 → 핵심 지표 → 리그별 랭킹 → 접힌 상세 → 규칙 한 곳.
// 용어: 등급(board)은 "리그", 가상 시뮬레이션 한 번은 "판".
const fmt = new Intl.NumberFormat('ko-KR');
const money = (n: number) => `${fmt.format(n)}원`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt.format(Math.abs(n))}원`;
const percent = (n: number) => `${n > 0 ? '▲ ' : n < 0 ? '▼ ' : ''}${Math.abs(n * 100).toFixed(2)}%`;
/** 매매 성과(유지 대비 초과 수익률)는 두 수익률의 차이라 %p로 보인다. 0.018 → "+1.80%p" */
const pp = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(2)}%p`;
const tone = (n: number) => n > 0 ? 'practice-rise' : n < 0 ? 'practice-fall' : '';
const points = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt.format(Math.abs(n))}점`;
/**
 * 하루 점수 한 칸(policies §8-8: #308부터 +100·0·−100, 이전 서버는 +1·0·−1). 안내 문구와 주 점수 칸 간격에만 쓰고 점수는 서버 값을 그대로 보인다.
 * 화면과 서버가 섞여 배포돼도 맞게, 서버가 준 승급 기준(이전 4, #308부터 400)으로 단위를 고른다
 */
const dayPoints = (r: { weeklyPromoteAt: number }) => r.weeklyPromoteAt >= 100 && r.weeklyPromoteAt % 100 === 0 ? 100 : 1;
const contestName = (id: string) => `${id.slice(0, 4)}년 ${Number(id.slice(5))}월 대회`;
const dateText = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-'); return `${Number(m)}월 ${Number(d)}일`; };

type View = 'home' | 'placement' | 'result' | 'play';

/** 배치고사 맞힌 수 → 시작 리그(서버 규칙 placementCuts). 참가 전 "오늘 할 일" 카드 오른쪽에 짧은 표로 둔다 */
function PlacementBoards({ info }: { info: ContestInfo }) {
  const { B50M, B100M } = info.rules.placementCuts, total = info.rules.placementQuestions;
  const range: Record<ContestBoard, string> = { B10M: `0~${B50M - 1}개`, B50M: `${B50M}~${B100M - 1}개`, B100M: `${B100M}~${total}개` };
  return <div className="contest-placement-boards">
    <span className="contest-placement-boards-title">맞힌 수로 정하는 시작 리그</span>
    <ol aria-label="맞힌 수로 정해지는 시작 리그">
      {info.boards.map(b => <li key={b.board}><span>{range[b.board]}</span><b><LeagueEmblem board={b.board} size={18} />{BOARD_LABEL[b.board]}</b><small>{money(b.seedMoney)}</small></li>)}
    </ol>
  </div>;
}

/** 참가 전 "오늘 할 일" 카드(비회원·배치고사 전 공통 뼈대): 왼쪽 설명과 주 행동 하나, 오른쪽 시작 리그 기준 */
function JoinCard({ info, title, text, action, guide }: { info: ContestInfo; title: string; text: string; action: ReactNode; guide?: boolean }) {
  const r = info.rules;
  return <section className="contest-card contest-today contest-join" aria-labelledby="contestJoinTitle">
    <div className="contest-join-main">
      <ul className="contest-join-facts" aria-label="배치고사 요약"><li>{r.placementQuestions}문제</li><li>30분</li><li>시즌마다 1번</li></ul>
      <h2 id="contestJoinTitle">{title}</h2>
      <p className="practice-muted">{text}</p>
      {action}
      {/* 시작 전 안내에만 둔다. 배치고사·대회 판을 하는 동안에는 가이드를 볼 수 없다(Issue #367) */}
      {guide && <p className="contest-join-guide"><Link to="/simulation/guide">공시가 처음이면 「공시 읽는 법」을 먼저 읽어 보세요 ›</Link></p>}
    </div>
    <PlacementBoards info={info} />
  </section>;
}

/** 빈·오류·로딩 상태를 한 모양으로. 오류일 때만 [다시 시도] */
function StateBox({ kind, text, onRetry }: { kind: 'empty' | 'error' | 'loading'; text: string; onRetry?: () => void }) {
  return <div className={`contest-state ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
    <p>{text}</p>
    {kind === 'error' && onRetry && <button className="btn btn-sm" type="button" onClick={onRetry}>다시 시도</button>}
  </div>;
}

/** 처음 그린 다음 프레임에 true. 막대가 0에서 차오르는 전환에 쓴다. 움직임 줄이기면 처음부터 true(최종값으로 그린다) */
function useMounted() {
  const [on, setOn] = useState(prefersReducedMotion);
  useEffect(() => { const raf = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(raf); }, []);
  return on;
}

/** 영역이 처음 화면에 들어오면 true(한 번만). 접힌 상세의 막대가 보기 전에 다 차 버리지 않게 쓴다. 움직임 줄이기면 처음부터 true */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined' || prefersReducedMotion());
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

/** 지금 시각. ms 간격으로 다시 그린다 */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(t); }, [ms]);
  return now;
}

const kstDate = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(t);
const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD에 하루씩 더한 날짜 목록(양 끝 포함). 달력 계산만 하고 점수는 서버 값을 쓴다 */
const dateRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

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

/** 내 순위. 판을 끝내고 돌아왔을 때(from이 있을 때)만 이전 순위에서 새 순위로 움직인다. 처음 볼 때는 바로 보인다 */
function RankCount({ rank, from }: { rank: number; from?: number | null }) {
  if (from == null || from === rank) return <>{fmt.format(rank)}위</>;
  return <CountUp key={from} value={rank} from={from} format={n => `${fmt.format(n)}위`} duration={1100} />;
}

/** 대회 배너 그림(장식, 대회 로고): 오르는 차트 위 트로피. 색은 배너 글자색(흰색) 한 가지의 투명도만 쓴다 */
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

/** 대회 배너(머리): 로고·대회 이름·기간·내 리그 엠블럼·마감까지. 대회 기간은 이 배너 한 곳에만 둔다 */
function ContestHead({ info, sample, alias, entry }: { info: ContestInfo; sample: boolean | null; alias: string | null; entry: ContestEntry | null }) {
  return <section className="contest-hero" aria-labelledby="contestTitle">
    <div className="contest-hero-body">
      <span className="contest-hero-kicker">회원 월간 대회 · 진행 중{sample && <span className="tag-ex">예시</span>}</span>
      <h2 id="contestTitle">{contestName(info.contestId)}</h2>
      <p>{dateText(info.startsAt)} 00시 ~ {dateText(info.endsAt)} 00시{alias && <> · 내 별명 <b>{alias}</b></>}</p>
      <div className="contest-hero-side">
        {entry && <span className="contest-hero-league"><LeagueEmblem board={entry.board} size={28} /><span><small>내 리그</small><b>{BOARD_LABEL[entry.board]}</b></span></span>}
        <Countdown endsAt={info.endsAt} />
      </div>
    </div>
    <HeroArt />
  </section>;
}

/** 참여 현황(접힌 상세, 누구나): 전체·리그별 참가자. 기간·순위는 머리 줄·핵심 지표에만 있다. 합계·비율은 서버 참가자 수를 더하고 나눠 보여 주기만 한다(내림) */
function Participation({ info, entry }: { info: ContestInfo; entry: ContestEntry | null }) {
  const [box, seen] = useSeen<HTMLDivElement>();
  const total = info.boards.reduce((s, b) => s + b.participants, 0);
  return <div ref={box} className="contest-participation">
    <p className="contest-part-total"><span>전체 참가자</span><strong>{fmt.format(total)}명</strong></p>
    <ul className="contest-part-boards" aria-label="리그별 참가자">
      {info.boards.map((b, i) => {
        const pct = total ? Math.floor(b.participants / total * 100) : 0;
        const mine = entry?.board === b.board;
        return <li key={b.board} className={mine ? 'mine' : ''} aria-current={mine ? 'true' : undefined}>
          <div className="contest-part-row">
            <b>{BOARD_LABEL[b.board]}</b>
            {mine ? <span className="contest-chip">내 리그</span> : !b.available && <span className="contest-chip muted">준비 중</span>}
            <small>{money(b.seedMoney)}로 시작</small>
            <span className="contest-part-count">{fmt.format(b.participants)}명 · {pct}%</span>
          </div>
          <div className="contest-bar" aria-hidden="true"><span style={{ width: `${seen ? pct : 0}%`, transitionDelay: `${i * 160}ms` }} /></div>
        </li>;
      })}
    </ul>
  </div>;
}

const GUIDE_KEY = 'fx.guide.contest';
const readGuide = () => { try { return localStorage.getItem(GUIDE_KEY); } catch { return null; } };
const saveGuide = (v: 'open' | 'closed') => { try { localStorage.setItem(GUIDE_KEY, v); } catch { /* 저장 못 해도 화면은 그대로 */ } };

/**
 * 규칙(한 곳): 대회 3단계와 자세한 규칙. 참가 전에는 펼치고, 참가한 뒤에는 접어 두며 펼침·접힘을 브라우저에 기억한다(fx.guide.contest).
 * 값은 서버 규칙
 */
function ContestRules({ info, joined }: { info: ContestInfo; joined: boolean }) {
  const [stored, setStored] = useState(readGuide);
  const open = joined ? stored === 'open' : true;
  const r = info.rules, day = dayPoints(r);
  return <details className="contest-card contest-fold contest-guide" open={open} onToggle={e => {
    const now = e.currentTarget.open;
    if (!joined || now === open) return;
    const v = now ? 'open' : 'closed';
    setStored(v); saveGuide(v);
  }}>
    <summary><h2>대회는 이렇게 진행돼요</h2><span>{open ? '접기' : '규칙 펼쳐 보기'}</span></summary>
    <ol className="contest-steps">
      <li><span className="contest-step-no" aria-hidden="true">1</span><b>배치고사</b><small>실제 과거 공시 {r.placementQuestions}문제로 1천만·5천만·1억 리그 중 시작 리그를 정해요</small></li>
      <li><span className="contest-step-no" aria-hidden="true">2</span><b>하루 {r.roundsPerDay}판</b><small>가상 종목을 매매해 그날 매매 성과 평균이 {pp(r.dailyTargetRate)} 이상이면 {points(day)}({r.roundsForDailyScore}판을 모두 한 날), 못 미치면 {points(-day)}</small></li>
      <li><span className="contest-step-no" aria-hidden="true">3</span><b>주 점수로 승급·강등</b><small>주 합이 {points(r.weeklyPromoteAt)} 이상이면 한 리그 위로, {points(r.weeklyDemoteAt)} 이하면 한 리그 아래로</small></li>
    </ol>
    <ul className="contest-rules-list">
      <li>매달 1일 00시에 열고 다음 달 1일 00시에 마감해요. 시즌마다 배치고사 {r.placementQuestions}문제로 시작 리그를 정해요(맞힌 수 {r.placementCuts.B50M}개 이상 5천만 리그, {r.placementCuts.B100M}개 이상 1억 리그, 그 아래 1천만 리그).</li>
      <li>배치고사는 실제 과거 공시 10개를 보고 공시 직후(공시 전날 종가 → 다음 거래일 종가)에 올랐을지 내렸을지 골라요. 실제 움직임으로 채점하고, 회사 이름과 날짜, 그다음 주(다음 거래일 종가 → 5번째 거래일 종가) 움직임은 제출한 뒤 공개해요. 30분이 지나면 고르지 않은 문제는 틀린 것으로 봐요.</li>
      <li>한 판은 지금 대회 잔액 전부로 시작하고 120거래일 동안 사건 {r.eventsPerRound}개를 만나요. 판이 끝난 총자산이 다음 판의 잔액이 되고, 대회 판은 채점하지 않아요.</li>
      <li>하루에 {r.roundsPerDay}판까지 할 수 있어요. 하루 점수는 그날 판들의 매매 성과 평균으로 정해요. 매매 성과는 내 판 수익률에서 같은 가격 흐름에 사건마다 가만히(유지) 있었을 때의 수익률을 뺀 값이에요(예: 내 판 +11.07%, 가만히 +9.27%면 +1.80%p). 평균이 {pp(r.dailyTargetRate)}에 못 미치면 {points(-day)}이에요. 목표 이상이면 그날 {r.roundsForDailyScore}판을 모두 했을 때 {points(day)}, 덜 했으면 0점이에요. 판을 안 한 날은 0이에요. 가만히만 있으면 0%p라 목표에 못 미쳐요.</li>
      <li>주(1~7일, 8~14일, 15~21일, 22일~말일) 점수 합이 {points(r.weeklyPromoteAt)} 이상이면 한 리그 승급, {points(r.weeklyDemoteAt)} 이하면 한 리그 강등이에요. 리그가 바뀌면 잔액은 새 리그의 대회 시드머니로 다시 시작해요.</li>
      <li>4주차(22일~말일)는 보너스 주예요. 대회 마지막 날 판정해 결과를 지난 대회 기록에 남기고, 리그는 바꾸지 않아요. 최종 순위는 4주차를 보낸 리그에서 매겨요.</li>
      <li>판이 끝난 뒤 잔액이 {money(r.liquidationBelow)} 미만이면 이번 시즌은 청산되어 더 할 수 없어요.</li>
      <li>순위는 리그 점수 → 매매 성과 평균 → 그 값에 먼저 도달한 순서로 정하고, 리그별 상위 {r.rankingTop}위와 내 순위를 회원만 봐요. 이름 대신 서버가 붙인 별명이 보여요.</li>
      <li>판을 그만두거나 창을 닫으면 남은 사건은 유지로 보고 끝까지 계산해 잔액에 반영해요.</li>
    </ul>
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

type PlacementQuestion = ContestPlacement['questions'][number];

/**
 * 배치고사: 한 화면에 한 문제. 머리(제목·타이머·진행)는 위에 붙어 있고, 문제 카드는 번호·유형 → 제목 → 공시 내용 → 답 버튼 순서다.
 * 유형 설명·읽는 법·자회사 안내는 답 버튼 아래 "이 공시 유형 알아보기"에 접어 둔다(02 §5-14).
 * 오른다/내린다를 고르면 바로 다음 문제로 넘어가고, [이전 문제]로 돌아갈 수 있다.
 * 돌아온 문제에서 고른 답을 다시 누르면 그 답을 그대로 두고 넘어가고, 다른 답을 누르면 바꿔서 넘어간다(취소는 없다).
 * 마지막 문제에서는 넘어가지 않고 제출한다. 채점은 제출 때 서버가 한다
 */
function PlacementForm({ placement, sample, busy, error, onSubmit }: { placement: ContestPlacement; sample: boolean | null; busy: boolean; error: string;
  onSubmit: (answers: Record<string, Prediction>) => void }) {
  const [answers, setAnswers] = useState<Record<string, Prediction>>({});
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const moved = useRef(false);
  const left = useRemaining(placement.expiresAt);
  const total = placement.questions.length;
  const q = placement.questions[index];
  const done = placement.questions.filter(x => answers[x.id]).length;
  const last = index === total - 1;
  const t = cleanTitle(q.title);
  const reading = typeReading(q);
  // 문제를 바꾸면(처음 열 때 말고) 새 문제 제목으로 포커스를 옮겨 화면 읽기 프로그램이 바로 읽게 한다
  useEffect(() => {
    if (!moved.current) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest('.contest-placement')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [index]);
  const go = (i: number) => { if (i < 0 || i >= total || i === index) return; moved.current = true; setIndex(i); };
  const choose = (v: Exclude<Prediction, null>) => {
    setAnswers(a => ({ ...a, [q.id]: v }));
    if (!last) go(index + 1);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(answers); };
  return <form className="contest-placement" onSubmit={submit}>
    <div className="contest-placement-bar">
      <div className="contest-placement-title">
        <h2>배치고사</h2>
        <span className="contest-progress-count">
          <span role="status" aria-live="polite"><b>{done}</b>/{total} 답함</span>
          {/* 문제 칸(게임 스테이지처럼): 답한 문제는 채우고 지금 문제는 테두리. 누르면 그 문제로 간다 */}
          <span className="contest-steps-dots">{placement.questions.map((x, i) => <button key={x.id} type="button" className={[answers[x.id] ? 'done' : '', i === index ? 'now' : ''].filter(Boolean).join(' ')}
            aria-label={`${i + 1}번 문제${answers[x.id] ? ', 답함' : ''}`} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)}>{i + 1}</button>)}</span>
        </span>
        {left != null && <span className={`contest-timer ${left === 0 ? 'over' : left < 300 ? 'urgent' : ''}`} role="timer" aria-live="off"
          aria-label={left > 0 ? `남은 시간 ${Math.floor(left / 60)}분 ${left % 60}초` : '제한 시간이 지났어요'}>
          <span aria-hidden="true">⏱</span>{left > 0 ? `${pad(Math.floor(left / 60))}:${pad(left % 60)}` : '시간 종료'}
        </span>}
      </div>
      {/* 채점 기준은 서버가 준다(basis). 반응 창 규칙 전에 시작해 저장된 배치고사는 5거래일로 채점하므로 그 기간을 안내한다 */}
      <p className="practice-muted">{placement.basis === 'FIVE_DAY'
        ? '그 뒤 5거래일(공시일 종가 → 5번째 거래일 종가) 동안 주가가 올랐을지 내렸을지 골라요. 이 배치고사는 규칙이 바뀌기 전에 시작해 5거래일 기준으로 채점해요.'
        : '공시 직후(공시 전날 종가 → 다음 거래일 종가) 주가가 올랐을지 내렸을지 골라요.'} 회사 이름과 날짜는 제출한 뒤 공개해요.</p>
      {left === 0 && <p role="status" className="contest-timer-over">제한 시간이 지났어요. 제출하면 고른 답 없이 채점된 결과를 보여 줘요.</p>}
    </div>
    <section key={q.id} className="contest-q-card" aria-labelledby={`contestQ-${q.id}`}>
      <p className="contest-q-meta"><span className="contest-q-no">{index + 1}</span><span className="contest-q-of">/ {total}</span>{q.industry} 회사<span className="contest-chip">{q.categoryName}</span>{(t.kind || t.notes.length > 0) && <span>{[t.kind, ...t.notes].filter(Boolean).join(' · ')}</span>}</p>
      <h3 id={`contestQ-${q.id}`} ref={heading} tabIndex={-1} className="contest-q-title">{t.main}</h3>
      {q.body && <p className="contest-q-body">{q.body}</p>}
      {/* 공시 내용(AI 요약 또는 주요 내용). 길어도 답 버튼 자리가 문제마다 같게 높이를 정하고 안에서 스크롤한다 */}
      <div className="contest-q-details" tabIndex={0} aria-label="공시 내용">
        <p className="contest-q-details-title">공시 내용{sample && <span className="tag-ex">예시</span>}</p>
        <div className="contest-q-story">{questionStory(q, t.main, sample).map((p, k) => <p key={k}>{p}</p>)}</div>
      </div>
      <div className="contest-answer" role="group" aria-label={`${index + 1}번 답`}>
        {(['POSITIVE', 'NEGATIVE'] as const).map(v => <button key={v} type="button" className={`${v === 'POSITIVE' ? 'up' : 'down'} ${answers[q.id] === v ? 'selected' : ''}`}
          aria-pressed={answers[q.id] === v} onClick={() => choose(v)}>
          <span className="contest-answer-mark" aria-hidden="true">{answers[q.id] === v ? '✓' : v === 'POSITIVE' ? '▲' : '▼'}</span>{v === 'POSITIVE' ? '오른다' : '내린다'}</button>)}
      </div>
      <div className="contest-q-nav">
        <button type="button" className="btn contest-q-prev" onClick={() => go(index - 1)} disabled={index === 0}>← 이전 문제</button>
        <p className="contest-q-tip practice-muted">{answers[q.id] ? (last ? '다른 답을 누르면 바꿔요.' : '고른 답을 다시 누르면 그대로 넘어가요.') : last ? '답을 고른 뒤 제출해요.' : '답을 고르면 다음 문제로 넘어가요.'}</p>
        {last && <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '채점 중…' : '제출하고 시작 리그 보기'}</button>}
      </div>
      {/* 예시·AI 요약 상자 밖에 두어 그 글의 일부로 읽히지 않게 한다(#387) */}
      <details className="contest-q-more">
        <summary>이 공시 유형 알아보기</summary>
        <p className="contest-q-guide">{CATEGORY_GUIDE[q.category]}</p>
        {t.subsidiary && <p className="contest-q-note">{SUBSIDIARY_NOTE}</p>}
        {reading && <p className="contest-q-guide"><b>읽는 법</b> {reading}</p>}
      </details>
    </section>
    <div className="contest-placement-foot">
      {last && total - done > 0 && <p className="practice-muted">고르지 않은 문제 {total - done}개는 틀린 것으로 채점해요.</p>}
      {error && <p role="alert" className="practice-rise">{error}</p>}
    </div>
  </form>;
}

/**
 * 결과 문제 머리의 등락. 반응 창 채점(REACTION)은 공시 직후(채점)와 그다음 주 두 숫자, 이 규칙 전에 시작한 배치고사(FIVE_DAY)는 5거래일 등락 하나.
 * 값은 서버 값 그대로(ADR-3)
 */
function Moves({ it }: { it: ContestPlacementResult['items'][number] }) {
  if (it.basis === 'REACTION' && it.reactionReturnRate != null && it.nextWeekReturnRate != null) {
    return <>공시 직후 <b className={tone(it.reactionReturnRate)}>{percent(it.reactionReturnRate)}</b> · 그다음 주 <b className={tone(it.nextWeekReturnRate)}>{percent(it.nextWeekReturnRate)}</b></>;
  }
  const r = it.subsequentReturnRate ?? 0;
  return <>5거래일 뒤 <b className={tone(r)}>{percent(r)}</b></>;
}

function PlacementDone({ result, questions, sample, onStart }: { result: ContestPlacementResult; questions: PlacementQuestion[]; sample: boolean | null; onStart: () => void }) {
  // 결과에는 주요 내용을 다시 싣지 않아(채점하면 문제 사본을 지움) 풀 때 받은 문제와 questionId로 잇는다
  const byId = new Map(questions.map(q => [q.id, q]));
  const heading = useRef<HTMLHeadingElement | null>(null);
  // 결과가 뜨면 페이지 맨 위에서 시작하고 제목에 포커스를 둔다(움직임 줄이기면 바로 이동)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    heading.current?.focus({ preventScroll: true });
  }, []);
  return <section className="contest-card contest-result" aria-labelledby="contestResultTitle">
    <div className="contest-result-head">
      <div>
        <h2 id="contestResultTitle" ref={heading} tabIndex={-1}>배치고사 결과</h2>
        <p className="contest-big">{result.total}문제 중 <b>{result.correct}개</b> 맞혔어요 → <span className="contest-result-league"><LeagueEmblem board={result.board} size={22} /><b>{BOARD_LABEL[result.board]}</b>에서 시작해요</span></p>
      </div>
      <button className="btn btn-primary contest-result-start" type="button" onClick={onStart}>대회 화면으로</button>
    </div>
    <ul className="contest-result-facts" aria-label="배치고사 안내">
      <li><span>시작 잔액</span><b>{money(result.entry.seedMoney)}</b></li>
      <li><span>배치고사는</span><b>시작 리그를 정하는 가벼운 퀴즈</b></li>
      <li><span>실력은</span><b>주간 점수로 겨뤄요</b></li>
    </ul>
    {/* 문제마다 보이는 두 숫자의 뜻(구간·채점 여부). 같은 유형이어도 방향이 자주 갈린다는 점은 퀴즈 안내로 줄였다 */}
    {result.items.some(it => it.basis === 'REACTION') && <dl className="contest-result-legend">
      <div><dt>공시 직후 <span className="contest-chip">채점</span></dt><dd>공시 전날 종가 → 다음 거래일 종가</dd></div>
      <div><dt>그다음 주 <span className="contest-chip muted">참고</span></dt><dd>다음 거래일 종가 → 5번째 거래일 종가. 다음 날 종가에 샀다고 가정한 비교라 시가에 샀다면 실제 수익률과 달라요</dd></div>
    </dl>}
    <ol className="contest-graded">
      {result.items.map((it, i) => { const q = byId.get(it.questionId); return <li key={it.questionId} className={it.correct ? 'ok' : 'no'}>
        <p className="contest-graded-head">
          <span className="contest-q-no">{i + 1}</span>
          <span>{it.correct ? '맞음' : '틀림'} · <b>{it.company}</b>{it.date ? ` · ${it.date}` : ''} · <Moves it={it} /> · 내 답 {it.prediction === 'POSITIVE' ? '오른다' : it.prediction === 'NEGATIVE' ? '내린다' : '고르지 않음'}</span>
        </p>
        {q && (() => { const t = cleanTitle(q.title); return <div className="contest-graded-question">
          <p className="contest-q-meta">{q.industry} 회사<span className="contest-chip">{q.categoryName}</span>{sample && <span className="tag-ex">예시</span>}</p>
          <h3 className="contest-q-title">{t.main}</h3>
          {/* 공시 줄글: 서버 값(회사·날짜·AI 요약 또는 주요 내용·공시 직후와 그다음 주 등락·유형 통계)을 문장으로 잇기만 한다 */}
          <div className="contest-q-story">{disclosureStory(q, it, t.main, t.subsidiary, sample).map((p, k) => <p key={k}>{p}</p>)}</div>
          <p className="contest-q-guide"><b>이런 공시예요</b> {CATEGORY_GUIDE[q.category]}</p>
          {typeReading(q) && <p className="contest-q-guide"><b>읽는 법</b> {typeReading(q)}</p>}
        </div>; })()}
      </li>; })}
    </ol>
  </section>;
}

/**
 * 이번 주 승급·강등까지 남은 점수(서버 주 점수와 규칙 값의 차이를 보여 주기만 한다).
 * 4주차(보너스 주)는 판정 결과를 기록만 하고 리그를 바꾸지 않으므로(policies §8-8, decisions/2026-11-06-contest-final-week)
 * 남은 점수 대신 기록될 결과(지난 대회 finalWeek와 같은 기준: 1억 리그 승급·1천만 리그 강등 제외)만 말한다
 */
function weekGap(entry: ContestEntry, rules: ContestInfo['rules'], finalWeek: boolean) {
  const w = entry.week;
  if (finalWeek) {
    const record = entry.board !== 'B100M' && w.points >= rules.weeklyPromoteAt ? '승급 기준 도달로 기록돼요'
      : entry.board !== 'B10M' && w.points <= rules.weeklyDemoteAt ? '강등 기준 도달로 기록돼요' : '지금은 승급·강등 기준 밖으로 기록돼요';
    return `보너스 주 · 리그는 그대로이고 결과는 지난 대회 기록에만 남아요 · ${record}`;
  }
  const promote = entry.board === 'B100M' ? '1억 리그는 승급 없음' : w.points >= rules.weeklyPromoteAt ? '승급 기준 도달' : `승급까지 ${fmt.format(rules.weeklyPromoteAt - w.points)}점`;
  const demote = entry.board === 'B10M' ? '1천만 리그는 강등 없음' : w.points <= rules.weeklyDemoteAt ? '강등 기준 도달' : `강등까지 ${fmt.format(w.points - rules.weeklyDemoteAt)}점`;
  return `${promote} · ${demote}`;
}

/** 승급·강등 배너(있을 때만). 청산·오늘 판 소진은 "오늘 할 일" 카드가 보인다 */
function StatusBanner({ entry }: { entry: ContestEntry }) {
  const change = entry.lastBoardChange;
  if (!change) return null;
  const up = BOARDS.indexOf(change.to) > BOARDS.indexOf(change.from);
  return <div className={`contest-banner contest-enter-in ${up ? 'up' : 'down'}`} role="status"><b>{up ? '▲ 승급' : '▼ 강등'}</b> 주 점수 {points(change.weekPoints)}로 {BOARD_LABEL[change.from]}에서 {BOARD_LABEL[change.to]}로 {up ? '올라왔어요' : '내려왔어요'}. 잔액은 새 리그의 대회 시드머니로 다시 시작했어요. <small>{dateText(change.at)}</small></div>;
}

/** 오늘 할 일(참가 중): [판 시작] · 남은 판 · 오늘 매매 성과 평균과 목표 막대. 청산·오늘 판 소진이면 끝난 상태를 보인다 */
function TodayCard({ info, entry, onPlay, busy }: { info: ContestInfo; entry: ContestEntry; onPlay: () => void; busy: boolean }) {
  const mounted = useMounted();
  const t = entry.today, rules = info.rules, day = dayPoints(rules);
  const rate = t.returnRate;
  const meter = rate == null ? 0 : Math.min(1, Math.abs(rate) / t.targetRate);
  const nextStart = dateText(info.endsAt);
  return <section className="contest-card contest-today" aria-labelledby="contestTodayTitle">
    <div className="contest-card-head">
      <h2 id="contestTodayTitle">오늘 할 일</h2>
      <span className="contest-today-count">오늘 <b>{t.rounds}</b>/{rules.roundsPerDay}판</span>
    </div>
    <div className="contest-today-goal">
      <p><Term k="today" /> <b className={tone(rate ?? 0)}>{rate == null ? '—' : pp(rate)}</b><span>목표 {pp(t.targetRate)} 이상</span></p>
      {/* 0을 가운데 두고 오른쪽 끝이 목표, 왼쪽 끝이 −목표. 마이너스면 왼쪽으로 파랗게 찬다(서버 값을 비율로 보여 주기만 한다) */}
      <div className="contest-meter" role="img" aria-label={rate == null ? '오늘 끝낸 판이 없어요' : `오늘 매매 성과 평균 ${pp(rate)}, 목표 ${pp(t.targetRate)}${rate < 0 ? ', 마이너스예요' : ''}`}>
        <div className="contest-meter-track">
          <span className={`contest-meter-fill ${rate != null && rate < 0 ? 'down' : 'up'}`} style={{ width: `${(mounted ? meter : 0) * 50}%` }} />
          <i className="contest-meter-zero" />
        </div>
        <div className="contest-meter-scale" aria-hidden="true"><span>{pp(-t.targetRate)}</span><span>0</span><span>목표 {pp(t.targetRate)}</span></div>
      </div>
      <p className="practice-muted contest-today-rule">{rate == null ? (t.rounds ? '오늘 끝낸 판이 아직 없어요. ' : '') : rate >= t.targetRate ? '오늘 목표 이상이에요. ' : `목표까지 ${pp(t.targetRate - rate)}. `}{rules.roundsForDailyScore}판을 모두 하고 목표 이상이면 {points(day)}, 못 미치면 {points(-day)}이에요.</p>
    </div>
    {entry.liquidated ? <div className="contest-cta-done down" role="status"><b>청산: 이번 대회는 여기까지예요</b><span>잔액이 {money(rules.liquidationBelow)} 미만으로 끝났어요. 지금 리그·점수로 순위에 남고, 다음 대회는 {nextStart} 00시에 배치고사로 시작해요.</span></div>
      : t.roundsLeft === 0 ? <div className="contest-cta-done" role="status"><b>오늘 {rules.roundsPerDay}판을 모두 했어요</b><span>내일 00시에 다시 할 수 있어요. 오늘 하루 점수는 자정이 지나 모든 판이 정산되면 정해요.</span></div>
      : <div className="contest-play">
        <button className="btn btn-primary contest-play-btn" type="button" onClick={onPlay} disabled={busy}>{entry.activeRound ? '새 판 시작' : '판 시작'}</button>
        <div className="contest-left">
          <p><b>{t.roundsLeft}판 남음</b><span>/ {rules.roundsPerDay}판</span></p>
          {/* 남은 판 막대 하나(서버 roundsLeft·roundsPerDay를 비율로 보여 주기만 한다) */}
          <span className="contest-left-bar" aria-hidden="true"><i style={{ width: `${t.roundsLeft / rules.roundsPerDay * 100}%` }} /></span>
          <small>한 판 120거래일 · 사건 {rules.eventsPerRound}개</small>
        </div>
      </div>}
    {entry.activeRound && !entry.liquidated && t.roundsLeft > 0 && <p className="practice-muted contest-today-note">진행 중인 판이 있어요. 새 판을 시작하면 그 판은 남은 사건을 유지로 보고 정산해요.</p>}
  </section>;
}

/** 이번 주 날짜 칸: 날짜마다 하루 점수를 글자로(서버 scoredDays). 오늘은 진행 중, 아직 안 온 날·점수 없는 날은 — */
function WeekDays({ start, end, entry, today }: { start: string; end: string; entry: ContestEntry; today: string }) {
  const scored = new Map(entry.scoredDays.map(d => [d.date, d]));
  // 좁은 화면에서 칸이 최소 너비를 넘으면 가로로 스크롤된다(4주차는 최대 10칸). 오늘 칸이 보이게 그 줄만 옮긴다(페이지는 움직이지 않음)
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = list.current, li = ol?.querySelector<HTMLElement>('li.today');
    if (ol && li && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = li.offsetLeft - (ol.clientWidth - li.offsetWidth) / 2;
  }, [today, start, end]);
  return <ol ref={list} className="contest-weekdays" tabIndex={0} aria-label="이번 주 날짜별 하루 점수">
    {dateRange(start, end).map(d => {
      const s = scored.get(d);
      const state = d === today ? 'today' : d > today ? 'future' : s ? (s.points > 0 ? 'up' : s.points < 0 ? 'down' : 'zero') : 'none';
      const value = state === 'today' ? '진행 중' : s ? `${s.points > 0 ? '▲ +' : s.points < 0 ? '▼ −' : ''}${fmt.format(Math.abs(s.points))}` : '—';
      const wd = WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];
      return <li key={d} className={state} aria-current={state === 'today' ? 'date' : undefined}>
        <b aria-hidden="true">{value}</b>
        <i className="contest-weekdays-dot" aria-hidden="true" />
        <small aria-hidden="true">{Number(d.slice(8))}<span>({wd})</span></small>
        <span className="sr-only">{dateText(d)} {state === 'today' ? '오늘 진행 중' : s ? `하루 점수 ${points(s.points)}${s.rounds ? ` · ${s.rounds}판` : ' · 판 없음'}` : state === 'future' ? '아직 오지 않은 날' : '점수 없음'}</span>
      </li>;
    })}
  </ol>;
}

/** 핵심 지표(참가 중): 순위 · 리그 점수 · 잔액 · 이번 주 점수(날짜 칸) */
function Metrics({ info, entry, prevRank }: { info: ContestInfo; entry: ContestEntry; prevRank?: number | null }) {
  const mounted = useMounted();
  const now = useNow(60000);
  const today = kstDate(now);
  const w = entry.week, rules = info.rules, day = dayPoints(rules);
  const weekInfo = info.weeks.find(x => x.week === w.week);
  const topShare = Math.floor(entry.rank / entry.participants * 1000) / 10;
  const clamped = Math.max(rules.weeklyDemoteAt, Math.min(rules.weeklyPromoteAt, w.points));
  // 주 점수 칸은 하루 점수 한 칸(day) 간격. 지금 칸은 주 점수에 가장 가까운 칸
  const cells = Array.from({ length: Math.floor((rules.weeklyPromoteAt - rules.weeklyDemoteAt) / day) + 1 }, (_, i) => rules.weeklyDemoteAt + i * day);
  const nowCell = cells.reduce((best, n) => Math.abs(n - clamped) < Math.abs(best - clamped) ? n : best, cells[0]);
  return <section className="contest-metrics" aria-label="내 위치">
    <div className="contest-stat contest-stat-rank"><span><LeagueEmblem board={entry.board} size={18} />순위</span><strong>{entry.rank <= 3 && <span className={`contest-medal m${entry.rank}`} aria-hidden="true">{entry.rank}</span>}<RankCount rank={entry.rank} from={prevRank} /></strong><small>{BOARD_LABEL[entry.board]} {fmt.format(entry.participants)}명 중 · {topShare >= 0.1 ? `상위 ${topShare.toFixed(1)}%` : '상위 0.1% 안'}</small></div>
    <div className="contest-stat"><span><Term k="boardPoints" /></span><strong><CountUp value={entry.boardPoints} format={points} /></strong><small>매매 성과 평균 <b className={tone(entry.excessRate ?? 0)}>{entry.excessRate == null ? '—' : pp(entry.excessRate)}</b> · 끝낸 판 {fmt.format(entry.rounds)}판</small></div>
    <div className="contest-stat"><span>잔액</span><strong><CountUp value={entry.balance} format={money} /></strong><small className={tone(entry.profit)}>리그 수익률 {percent(entry.returnRate)} · {signed(entry.profit)}</small></div>
    <div className="contest-stat contest-stat-week">
      <span><Term k="week" /><small>{w.week}주 · {weekInfo ? `${dateText(weekInfo.startsOn)}~` : ''}{dateText(w.endsOn)}</small></span>
      <p className="contest-week-line"><strong className={tone(w.points)}>{points(w.points)}</strong><span className="contest-week-gap">{weekGap(entry, rules, w.week === info.weeks.length)}</span>
        {entry.board !== 'B100M' && w.week !== info.weeks.length && <span className="contest-next-league"><LeagueEmblem board={BOARDS[BOARDS.indexOf(entry.board) + 1]} size={18} />승급하면 {BOARD_LABEL[BOARDS[BOARDS.indexOf(entry.board) + 1]]}</span>}</p>
      <div className="contest-week" role="img" aria-label={`이번 주 ${points(w.points)}, ${points(rules.weeklyDemoteAt)}부터 ${points(rules.weeklyPromoteAt)}까지`} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0,1fr))` }}>
        {cells.map(n => {
          const filled = mounted && (w.points > 0 ? n > 0 && n <= nowCell : w.points < 0 ? n < 0 && n >= nowCell : false);
          return <span key={n} className={[n === nowCell ? 'now' : '', filled ? (n > 0 ? 'fill up' : 'fill down') : '', n === rules.weeklyPromoteAt ? 'promote' : n === rules.weeklyDemoteAt ? 'demote' : ''].filter(Boolean).join(' ')}
            style={{ transitionDelay: `${Math.abs(n / day) * 60}ms` }}>{n === rules.weeklyPromoteAt ? <><i>승급 </i>{fmt.format(n)}</> : n === rules.weeklyDemoteAt ? <><i>강등 </i>{fmt.format(n)}</> : fmt.format(n)}</span>;
        })}
      </div>
      {weekInfo && <WeekDays start={weekInfo.startsOn} end={weekInfo.endsOn} entry={entry} today={today} />}
    </div>
  </section>;
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

/** 접힌 랭킹에서 보이는 줄 수. 나머지는 [더 보기]로 펼친다 */
const RANK_PAGE = 10;
/** 펼칠 때 줄마다 나타나는 시차(ms)와 그 상한. 100명이어도 펼침이 0.6초 안에 끝나게 한다 */
const ROW_STAGGER = 24, ROW_STAGGER_MAX = 600;

/** 별명 첫 글자 아바타(장식). 나는 브랜드 면 */
function Avatar({ alias, me }: { alias: string; me?: boolean }) {
  return <span className={`contest-avatar${me ? ' me' : ''}`} aria-hidden="true">{[...alias][0] ?? '?'}</span>;
}

/** 왕관(장식, 1위 시상대 위) */
function Crown() {
  return <svg className="contest-crown" viewBox="0 0 32 22" width="28" height="19" aria-hidden="true" focusable="false">
    <path d="M3 18 1 5l8 6 7-10 7 10 8-6-2 13Z" /><rect x="3" y="18.5" width="26" height="3" rx="1.2" />
  </svg>;
}

/** 순위 배지: 1~3위는 메달, 그 밖은 숫자 */
function RankBadge({ rank }: { rank: number }) {
  return <span className={`contest-rank-badge${rank <= 3 ? ` m${rank}` : ''}`}>{fmt.format(rank)}</span>;
}

/** 1~3위 시상대(별명·리그 점수·매매 성과 평균, 서버 값). 화면은 2·1·3 순서로 단을 세우고, 읽는 순서는 1·2·3위 */
function Podium({ rows }: { rows: ContestRankingRow[] }) {
  const top = rows.filter(r => r.rank <= 3).slice(0, 3);
  if (!top.length) return null;
  return <ol className="contest-podium" aria-label="1~3위">
    {top.map(r => <li key={`${r.rank}-${r.alias}`} className={`p${r.rank}${r.isMe ? ' me' : ''}${r.liquidated ? ' liquidated' : ''}`}>
      <div className="contest-podium-player">
        {r.rank === 1 && <Crown />}
        <Avatar alias={r.alias} me={r.isMe} />
        <b>{r.alias}{r.isMe && <span className="contest-chip">나</span>}</b>
        <span className="contest-podium-points">{points(r.boardPoints)}</span>
        <small>매매 성과 평균 <span className={tone(r.excessRate ?? 0)}>{r.excessRate == null ? '—' : pp(r.excessRate)}</span></small>
      </div>
      <div className="contest-podium-step"><span>{r.rank}</span><small>위</small></div>
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
  // more: [더 보기]로 펼친 줄(위에서부터 차례로 나타난다, 사용자가 누른 것에 대한 반응. 움직임 줄이기면 바로 보인다)
  const row = (r: ContestRankingRow, more?: number) => <tr key={`${r.rank}-${r.alias}`} ref={r.isMe ? meRef : undefined} tabIndex={r.isMe ? -1 : undefined}
    className={[r.isMe ? 'me' : '', r.liquidated ? 'liquidated' : '', more != null ? 'contest-rank-in' : ''].filter(Boolean).join(' ')}
    style={more != null ? { '--d': `${Math.min(more * ROW_STAGGER, ROW_STAGGER_MAX)}ms` } as CSSProperties : undefined}>
    <td className="contest-rank-no"><RankBadge rank={r.rank} /></td>
    <td className="contest-rank-alias"><span className="contest-rank-player"><span>{r.alias}</span>{r.isMe && <span className="contest-chip">나</span>}{r.liquidated && <span className="contest-chip muted">청산</span>}</span></td>
    <td className="num contest-rank-points">{points(r.boardPoints)}</td>
    <td className="num"><span className={`contest-pill ${r.excessRate == null ? '' : r.excessRate > 0 ? 'up' : r.excessRate < 0 ? 'down' : ''}`}>{r.excessRate == null ? '—' : `${r.excessRate > 0 ? '▲ ' : r.excessRate < 0 ? '▼ ' : ''}${pp(r.excessRate)}`}</span></td>
    <td className="num opt">{money(r.balance)}</td>
    <td className="num opt">{fmt.format(r.rounds)}</td>
  </tr>;
  const top = ranking.items.slice(0, RANK_PAGE), rest = ranking.items.slice(RANK_PAGE);
  // 내 줄이 접힌 목록 밖(11위 아래)이거나 상위 100위 밖이면 ⋯ 뒤에 내 줄을 붙인다
  const meHidden = !expanded && rest.find(r => r.isMe);
  const meOutside = ranking.me && !ranking.items.some(r => r.isMe) ? ranking.me : meHidden || null;
  const more = rest.length;
  return <>
    <div className="contest-table-wrap">
      <table className="contest-table contest-rank">
        <caption className="sr-only">{BOARD_LABEL[ranking.board]} 순위, {ranking.status === 'SETTLED' ? '확정' : '지금 기준'}, 참가자 {fmt.format(ranking.participants)}명</caption>
        <thead><tr><th scope="col">순위</th><th scope="col">플레이어</th><th scope="col" className="num">리그 점수</th><th scope="col" className="num">매매 성과 평균</th><th scope="col" className="num opt">잔액</th><th scope="col" className="num opt">판 수</th></tr></thead>
        <tbody>
          {top.map(r => row(r))}
          {expanded && rest.map((r, i) => row(r, i))}
          {meOutside && <tr className="contest-rank-gap" aria-hidden="true"><td colSpan={6}>⋯</td></tr>}
          {meOutside && row(meOutside)}
        </tbody>
      </table>
    </div>
    {more > 0 && <button type="button" className="contest-more" aria-expanded={expanded} onClick={() => onExpand(!expanded)}>
      {expanded ? `${RANK_PAGE}위까지만 보기` : `더 보기 · ${fmt.format(more)}명 더`}<span className={`contest-more-chev${expanded ? ' open' : ''}`} aria-hidden="true">▾</span>
    </button>}
  </>;
}

/** 지난 대회: 배치 리그 → 최고 리그 → 최종 리그 흐름 카드 */
function HistoryCards({ history }: { history: ContestResult[] }) {
  return <ul className="contest-history">{history.map(h => <li key={h.contestId}>
    <div className="contest-history-head"><b>{contestName(h.contestId)}</b>{h.liquidated && <span className="contest-chip muted">청산</span>}</div>
    <ol className="contest-flow" aria-label="리그 흐름">
      <li><small>배치</small>{BOARD_LABEL[h.placementBoard]}</li>
      <li><small>최고</small>{BOARD_LABEL[h.highestBoard]}</li>
      <li className="final"><small>최종</small>{BOARD_LABEL[h.finalBoard]}</li>
    </ol>
    <p><b>{fmt.format(h.participants)}명 중 {fmt.format(h.rank)}위</b> · 리그 점수 {points(h.boardPoints)}</p>
    {h.finalWeek && <p>보너스 주 {points(h.finalWeek.points)}{h.finalWeek.result === 'PROMOTE' ? <span className="practice-rise"> ▲ 승급 기준 도달</span> : h.finalWeek.result === 'DEMOTE' ? <span className="practice-fall"> ▼ 강등 기준 도달</span> : null}</p>}
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

/** 투자 시뮬레이션의 "월간 대회" 탭 */
export function VirtualContest({ active }: { active: boolean }) {
  const { status } = useSession();
  const member = status === 'member';
  const { openLogin } = useLoginModal();
  const location = useLocation();
  const [info, setInfo] = useState<ContestInfo | null>(null);
  const [mine, setMine] = useState<ContestMine | null>(null);
  // 예시 자료인지(가상 시뮬레이션 상태). 확인하기 전·확인에 실패하면 null이고, 공시 AI 요약의 출처 안내를 붙이지 않는다
  const [sample, setSample] = useState<boolean | null>(null);
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
  const [prevRank, setPrevRank] = useState<number | null>(null);
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
      if (me?.current) clearPlacement();
      setBoard(b => b ?? me?.current?.board ?? 'B10M');
    } catch (e) { if (current === generation.current) setError(errorText(e)); }
  }, [member]);
  useEffect(() => { if (status !== 'loading') void load(); }, [load, status]);
  useEffect(() => { void getVirtualSimStatus().then(s => setSample(s.isSample)).catch(() => {}); }, []);
  useEffect(() => { if (!member) { setView('home'); setPlacement(null); setResult(null); } }, [member]);

  // 리그별 랭킹(회원만). 리그를 바꾸면 불러오는 동안 스켈레톤 행을 보인다
  useEffect(() => {
    if (!member || !info || !board || view === 'play') return;
    let alive = true;
    setRankingState(s => (ranking?.board === board && s === 'ready' ? s : 'loading'));
    getRanking(info.contestId, board)
      .then(r => { if (alive) { setRanking(r); setRankingState('ready'); } })
      .catch(() => { if (alive) setRankingState('error'); });
    return () => { alive = false; };
    // ranking은 같은 리그 다시 불러오기에서 스켈레톤을 띄우지 않으려고 읽기만 한다
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
    if (text) { setToast(text); setPrevRank(after.board === before.board && after.rank !== before.rank ? before.rank : null); beforePlay.current = null; }
  }, [mine, view]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const beginPlacement = async () => {
    setBusy(true); setError('');
    try { const p = await startPlacement(); markPlacement(info?.contestId ?? '', p.expiresAt); setPlacement(p); setView('placement'); }
    catch (e) { setError(errorText(e)); if (e instanceof ApiError && e.code === 'CONTEST_ALREADY_JOINED') void load(); }
    finally { setBusy(false); }
  };
  const submit = async (answers: Record<string, Prediction>) => {
    if (!placement) return;
    setBusy(true); setError('');
    try {
      const graded = await submitPlacement(placement.placementId, placement.questions.map(q => ({ questionId: q.id, prediction: answers[q.id] ?? null })));
      clearPlacement(); setResult(graded); setView('result'); setBoard(graded.board); void load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const settled = useCallback(() => { void load(); }, [load]);
  const exit = useCallback(() => { setView('home'); }, []);

  if (!info) return <section className="contest-card">{error ? <StateBox kind="error" text={error} onRetry={() => void load()} /> : <StateBox kind="loading" text="대회 정보를 불러오는 중…" />}</section>;

  const entry = mine?.current ?? null;
  if (view === 'play' && entry) {
    return <VirtualSimulation active={active} onGoPast={exit} contest={{ board: entry.board, today: entry.today, roundsPerDay: info.rules.roundsPerDay, dayPoints: dayPoints(info.rules), onSettled: settled, onExit: exit }} />;
  }
  const play = () => { beforePlay.current = entry; setToast(''); setPrevRank(null); setView('play'); };
  const tabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!board) return;
    const i = BOARDS.indexOf(board);
    const next = e.key === 'ArrowRight' ? BOARDS[(i + 1) % BOARDS.length] : e.key === 'ArrowLeft' ? BOARDS[(i + BOARDS.length - 1) % BOARDS.length]
      : e.key === 'Home' ? BOARDS[0] : e.key === 'End' ? BOARDS[BOARDS.length - 1] : null;
    if (!next) return;
    e.preventDefault(); setBoard(next); tabs.current[next]?.focus();
  };
  const goToMe = () => {
    setJumpToMe(true);
  };

  // 리그별 랭킹(회원만). 배치고사 전에는 미리보기, 비회원은 안내 한 줄
  const rankingCard = <section className="contest-card" aria-labelledby="contestRankTitle">
    <div className="contest-card-head">
      <h2 id="contestRankTitle"><svg className="contest-title-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 3h8v4a4 4 0 0 1-8 0Z" /><path d="M6 4.5H3.5a2.5 3 0 0 0 3 4M14 4.5h2.5a2.5 3 0 0 1-3 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><rect x="9" y="11" width="2" height="3.5" /><rect x="6" y="14.5" width="8" height="2.5" rx="1" /></svg>리그별 랭킹 {member && ranking && rankingState === 'ready' && <small>{ranking.status === 'SETTLED' ? '확정' : '지금 기준'} · 참가 {fmt.format(ranking.participants)}명</small>}</h2>
      {member && <div className="contest-rank-tools">
        {ranking?.me && rankingState === 'ready' && <button type="button" className="btn btn-sm" onClick={goToMe}>내 순위로 이동</button>}
        <div className="contest-seg" role="tablist" aria-label="리그 고르기">{BOARDS.map(b => <button key={b} type="button" role="tab" id={`contestRankTab-${b}`} aria-controls="contestRankPanel"
          ref={el => { tabs.current[b] = el; }} aria-selected={board === b} tabIndex={board === b ? 0 : -1} className={board === b ? 'selected' : ''}
          onClick={() => setBoard(b)} onKeyDown={tabKey}><LeagueEmblem board={b} size={16} />{BOARD_LABEL[b]}</button>)}</div>
      </div>}
    </div>
    {!member ? <StateBox kind="empty" text={`랭킹은 회원만 볼 수 있어요. 로그인하면 리그별 상위 ${info.rules.rankingTop}위와 내 순위를 봐요.`} />
      : <div id="contestRankPanel" role="tabpanel" aria-labelledby={board ? `contestRankTab-${board}` : undefined} aria-busy={rankingState === 'loading'}>
        {rankingState === 'error' ? <StateBox kind="error" text="랭킹을 불러오지 못했어요." onRetry={() => setRankingTry(n => n + 1)} />
          : rankingState === 'loading' || !ranking ? <><span className="sr-only">랭킹을 불러오는 중</span><RankingSkeleton /></>
          : !ranking.items.length ? <StateBox kind="empty" text="아직 이 리그에 참가자가 없어요." />
          : <div key={ranking.board} className="contest-rank-swap"><Podium rows={ranking.items} /><RankingTable ranking={ranking} expanded={expanded} onExpand={setExpanded} meRef={meRow} /></div>}
      </div>}
    {member && <p className="practice-muted">리그 점수가 같으면 지금 리그에서 끝낸 판들의 매매 성과 평균이 높은 순이에요. 별명 외의 회원 정보는 보이지 않아요.</p>}
  </section>;

  // 접힌 상세: 내 판 기록(참가 중) · 참여 현황(누구나) · 지난 대회(있을 때)
  const details = <div className="contest-details">
    {entry && <details className="contest-card contest-fold">
      <summary><h2>내 판 기록</h2><span>{entry.recentRounds.length ? `최근 ${entry.recentRounds.length}판 · 펼쳐 보기` : '아직 판이 없어요'}</span></summary>
      <RoundHistory entry={entry} />
    </details>}
    <details className="contest-card contest-fold">
      <summary><h2>참여 현황</h2><span>전체 {fmt.format(info.boards.reduce((s, b) => s + b.participants, 0))}명 · 펼쳐 보기</span></summary>
      <Participation info={info} entry={entry} />
    </details>
    {member && !!mine?.history.length && <details className="contest-card contest-fold">
      <summary><h2>지난 대회</h2><span>{mine.history.length}개 · 펼쳐 보기</span></summary>
      <HistoryCards history={mine.history} />
      <p className="practice-muted">지난 대회 기록은 대회가 끝나고 12개월 동안 보관해요.</p>
    </details>}
  </div>;

  return <div className="contest">
    {/* 배치고사를 푸는 동안은 문제만 보인다 */}
    {view !== 'placement' && <ContestHead info={info} sample={sample} alias={mine?.alias ?? null} entry={view === 'result' ? null : entry} />}
    {error && <StateBox kind="error" text={error} onRetry={() => { setError(''); void load(); }} />}

    {view === 'placement' && placement ? <PlacementForm placement={placement} sample={sample} busy={busy} error={error} onSubmit={answers => void submit(answers)} />
      : view === 'result' && result ? <PlacementDone result={result} questions={placement?.questions ?? []} sample={sample} onStart={() => setView('home')} />
      : <>
        {entry && <StatusBanner entry={entry} />}
        {!member ? <JoinCard info={info} title="로그인하고 참가해요" text="회원만 참가할 수 있어요. 로그인하면 배치고사로 시작 리그를 정하고 리그별 순위로 겨뤄요."
            action={<button className="btn btn-primary" type="button" onClick={() => openLogin(location.pathname + location.search)}>로그인하고 참가하기</button>} />
          : !entry ? <JoinCard info={info} title="배치고사로 시작해요" text="실제 과거 공시를 보고 공시 직후에 주가가 올랐을지 내렸을지 골라요. 맞힌 수로 시작 리그가 정해져요." guide
            action={<button className="btn btn-primary" type="button" onClick={() => void beginPlacement()} disabled={busy}>{busy ? '문제 준비 중…' : '배치고사 보기'}</button>} />
          : <div className="contest-main">
            <TodayCard info={info} entry={entry} busy={busy} onPlay={play} />
            <Metrics info={info} entry={entry} prevRank={prevRank} />
          </div>}
        <Reveal>{rankingCard}</Reveal>
        <Reveal order={1}>{details}</Reveal>
        <ContestRules info={info} joined={!!entry} />
      </>}

    <p className="practice-footnote">가상 종목·가상 사건으로 겨루는 대회예요. 실제 기업이 아니고, 대회 순위·점수는 앞으로의 수익을 뜻하지 않으며 투자 권유가 아니에요. 배당·세금·수수료는 제외했어요.</p>
    {toast && <div className="toast contest-toast" role="status"><span>{toast}</span><button type="button" aria-label="알림 닫기" onClick={() => setToast('')}>×</button></div>}
  </div>;
}
