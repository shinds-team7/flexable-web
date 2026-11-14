import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useLoginModal } from '@/components/LoginModal';
import {
  FALLBACK_TEXT, GOAL_LIMITS, TYPE_LABEL, deleteSavedScenario, periodText, fetchGoalScenarios, getSavedScenario, listSavedScenarios, saveScenario,
  type GoalScenario, type GoalScenarioResult, type SavedGoalScenario, type SavedScenarioList, type ScenarioProduct, type ScenarioProductType,
  type SeriesPoint, type StartDeposit,
} from '@/data/goalScenarios';
import { ApiError, errorText } from '@/lib/api';
import '@/styles/goal-plan.css';

// F7 목표 달성 시나리오(/goal, Issue #175·#201·#431, docs/policies.md §7).
// 시작 금액·월 납입 가능액·기한(목표 금액 선택)으로 안정·균형·적극 세 조합을 비교한다.
// 금액·확률·비중·그래프 값은 모두 서버 계산 값이고, 화면은 그리기만 한다(ADR-3). 회원은 플랜 전체를 그때 결과 그대로 이름을 붙여 최대 5개 저장한다(§7-8).
const COLORS: Record<ScenarioProductType, string> = {
  SAVINGS: 'var(--color-series-1)', CMA: 'var(--color-series-3)', KR_INDEX_ETF: 'var(--color-series-2)',
  US_INDEX_ETF: 'var(--color-series-4)', KOSPI_TOP5: 'var(--color-series-5)',
};

const AI_REUSE_TIP = '같은 조건으로 만든 AI 조합은 횟수가 차감되지 않아요.';
/** AI 해설의 전망 고지(policies §7-6, #398). 전망은 AI 학습 지식으로만 쓴다. */
const AI_OUTLOOK_NOTICE = '전망은 AI가 학습한 일반적인 내용이에요. 최신 뉴스나 실적을 확인한 것이 아니고 수익을 보장하지 않아요.';
/** 유형별 역할 문단의 첫머리(띄어쓰기 뺌)로 어느 유형인지 찾는다. 유형 해설은 유형 이름으로 시작한다. */
// 유형 이름 바로 뒤에 "은/는"이 와야 한다. "적금·CMA는"처럼 여러 유형을 묶어 시작하는 문단은 한 유형 문단이 아니다(#402).
const ROLE_PREFIX: [ScenarioProductType, RegExp][] = [
  ['SAVINGS', /^적금[은는]/], ['CMA', /^CMA[은는]/i], ['KR_INDEX_ETF', /^국내(대표)?(지수)?ETF[은는]/i], ['US_INDEX_ETF', /^미국(대표)?(지수)?ETF[은는]/i],
  ['KOSPI_TOP5', /^코스피(대형주|상위(5|다섯)?(개)?종목)[은는]/],
];
/** 이 시나리오에 비중이 있는 유형만 소제목을 붙인다. 이름으로 시작하지 않는 문단은 소제목 없이 보여 준다. 데모 조합은 부르지 않는다. */
function roleType(line: string, plan: GoalScenario): ScenarioProductType | null {
  const head = line.replace(/\s+/g, '');
  const found = ROLE_PREFIX.find(([, re]) => re.test(head))?.[0];
  return found && plan.mix.some((m) => m.type === found && m.ratioPercent > 0) ? found : null;
}
const won = (n: number) => n.toLocaleString('ko-KR');
/** 표시용 만 원 단위(내림). 서버 값을 읽기 쉽게 바꿀 뿐 계산 결과를 바꾸지 않는다. */
function manwon(n: number) {
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  const man = Math.floor(abs / 10_000);
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (!eok && !rest) return `${sign}${won(abs)}원`;
  return sign + [eok ? `${eok}억` : '', rest ? `${won(rest)}만` : ''].filter(Boolean).join(' ') + ' 원';
}
/** 수익은 원 단위 그대로 부호를 붙여 보여 준다(+는 이익, −는 손실). 예: +4,107,130원 */
const gainText = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${won(Math.abs(n))}원`;
const pct = (bp: number) => `${Math.floor(bp / 100)}%`;
const digits = (s: string) => s.replace(/[^0-9]/g, '');
const savedDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');
/** 그래프 축 눈금용 짧은 금액(만 원 단위 반올림 없이 내림). */
function axisMoney(n: number) {
  if (n >= 100_000_000) return `${Math.floor(n / 10_000_000) / 10}억`;
  if (n >= 10_000) return `${won(Math.floor(n / 10_000))}만`;
  return won(n);
}

type SubProduct = { key: string; name: string; meta: string | null; basis: boolean };
const YEAR_OPTIONS = [0, 1, 2, 3, 4, 5];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i);
/** 세부 상품 목록을 처음부터 펼쳐 둘 카테고리. */
const DEFAULT_OPEN: ScenarioProductType[] = ['SAVINGS'];

/** 적금 회사·기본금리 설명. 값이 없는 칸은 뺀다. */
function savingsMeta(company: string | null, ratePercent: string | null) {
  return [company, ratePercent ? `기본금리 연 ${ratePercent}%` : null].filter(Boolean).join(' · ') || null;
}

/** 카테고리 아래에 나열할 세부 상품. 적금·지수 ETF는 대표 상품 + 함께 볼 상품이고,
 *  금액·확률은 대표 상품으로만 계산하므로(policies §7-2) 함께 볼 상품이 있으면 대표 상품에 계산 기준 표시를 붙인다. */
function subProducts(p: ScenarioProduct | undefined, type: ScenarioProductType): SubProduct[] {
  if (!p) return [];
  if (type === 'CMA') return [{ key: 'cma', name: '수시 입출금', meta: p.ratePercent ? `연 ${p.ratePercent}%${p.isSample ? ' (예시 금리)' : ''}` : null, basis: false }];
  if (type === 'KOSPI_TOP5') return p.items.map((i, n) => ({ key: i.code ?? `${n}`, name: i.name, meta: null, basis: false }));
  const lead = p.items[0];
  const hasMore = p.alternatives.length > 0;
  return [
    { key: lead.code ?? 'lead', name: lead.name, meta: type === 'SAVINGS' ? savingsMeta(lead.company, p.ratePercent) : null, basis: hasMore },
    ...p.alternatives.map((a) => ({ key: a.code, name: a.name, meta: type === 'SAVINGS' ? savingsMeta(a.company, a.ratePercent) : null, basis: false })),
  ];
}

/** 적금 만기가 기한보다 짧을 때의 안내(policies §7-2). 같으면 null. */
function afterMaturity(p: ScenarioProduct | undefined, months: number) {
  const term = p?.termMonths;
  if (!term || term >= months) return null;
  return `만기 ${periodText(term)} · 남은 ${periodText(months - term)}은 CMA 예시 금리로 계산했어요`;
}

/** 시작 금액의 적금 몫을 어디에 넣었는지 안내(policies §7-4). */
function startDepositNote(start: number, deposit: StartDeposit | null) {
  if (deposit === null) return `시작 금액 중 적금 몫 ${won(start)}원은 CMA 예시 금리로 계산했어요`;
  return `시작 금액 중 적금 몫 ${won(start)}원은 정기예금(${deposit.company} ${deposit.name}, 연 ${deposit.ratePercent}%, 만기 ${periodText(deposit.termMonths)})에 맡겨요`;
}

/** 결과 범위 막대. 목표 금액이 있을 때만 목표 표시를 둔다. */
function RangeBar({ low, median, high, target }: { low: number; median: number; high: number; target: number | null }) {
  const min = Math.min(low, target ?? low) * 0.92;
  const max = Math.max(high, target ?? high) * 1.04;
  const pos = (v: number) => `${((v - min) / (max - min || 1)) * 100}%`;
  return <div className="gp-range" role="img" aria-label={`하위 10% ${manwon(low)}, 중간값 ${manwon(median)}, 상위 10% ${manwon(high)}${target !== null ? `, 목표 ${manwon(target)}` : ''}`}>
    <span className="gp-range-track" />
    <span className="gp-range-fill" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />
    <span className="gp-range-median" style={{ left: pos(median) }} />
    {target !== null && <span className="gp-range-target" style={{ left: pos(target) }}><span>목표</span></span>}
  </div>;
}

/** 달마다의 하위 10%·중간값·상위 10% 세 선을 한 그래프에 겹쳐 그린다(policies §7-5 series). 값은 서버가 준 그대로다. */
function GrowthChart({ series, monthly, target }: { series: SeriesPoint[]; monthly: number; target: number | null }) {
  const W = 360;
  const H = 190;
  const pad = { l: 40, r: 10, t: 12, b: 22 };
  const last = series[series.length - 1];
  const months = last.month;
  const top = Math.max(...series.map((p) => p.high), target ?? 0) * 1.06 || 1;
  const x = (m: number) => pad.l + (m / (months || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const line = (k: 'low' | 'median' | 'high') => series.map((p) => `${x(p.month).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const band = `${series.map((p) => `${x(p.month).toFixed(1)},${y(p.high).toFixed(1)}`).join(' ')} ${[...series].reverse().map((p) => `${x(p.month).toFixed(1)},${y(p.low).toFixed(1)}`).join(' ')}`;
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => Math.floor(top * f));
  const xTicks = months <= 12 ? [0, Math.round(months / 2), months] : Array.from({ length: Math.floor(months / 12) + 1 }, (_, i) => i * 12).concat(months % 12 ? [months] : []);
  const label = `월 납입 금액이 ${won(monthly)}원일 때 ${periodText(months)} 동안의 자산 증가 추이. 기한 말 하위 10% ${manwon(last.low)}, 중간값 ${manwon(last.median)}, 상위 10% ${manwon(last.high)}`;
  return <figure className="gp-growth">
    <figcaption className="gp-growth-title">월 납입 금액이 <b className="num">{won(monthly)}원</b>일 때 자산 증가 추이</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="gp-growth-svg">
      {ticks.map((t) => <g key={t}>
        <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="gp-growth-grid" />
        <text x={pad.l - 6} y={y(t)} className="gp-growth-axis" textAnchor="end" dominantBaseline="middle">{axisMoney(t)}</text>
      </g>)}
      {xTicks.map((m) => <text key={m} x={x(m)} y={H - 6} className="gp-growth-axis" textAnchor={m === 0 ? 'start' : m === months ? 'end' : 'middle'}>{m === 0 ? '시작' : periodText(m)}</text>)}
      <polygon points={band} className="gp-growth-band" />
      {target !== null && <g>
        <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} className="gp-growth-target" />
        <text x={W - pad.r} y={y(target) - 4} className="gp-growth-axis" textAnchor="end">목표</text>
      </g>}
      <polyline points={line('low')} className="gp-growth-line gp-growth-low" />
      <polyline points={line('high')} className="gp-growth-line gp-growth-high" />
      <polyline points={line('median')} className="gp-growth-line gp-growth-median" />
    </svg>
    <ul className="gp-growth-legend" aria-hidden="true">
      <li><span className="gp-growth-key gp-growth-high" />상위 10%</li>
      <li><span className="gp-growth-key gp-growth-median" />중간값</li>
      <li><span className="gp-growth-key gp-growth-low" />하위 10%</li>
    </ul>
  </figure>;
}

/** AI 해설 카드. 머리에 제목과 오른쪽 동작(저장)을 두고, 조합 이유 → 유형별 역할 → 참고 해설(차이·주의할 점·계산 결과) 순으로 보여 준다. */
function AiCard({ plan, demo, action }: { plan: GoalScenario; demo: boolean; action?: ReactNode }) {
  const parts = plan.explanationParts;
  const roles = parts?.roles.split(/\n+/).filter((l) => l.trim()) ?? [];
  const extra = parts ? [parts.comparison, parts.fit].filter((t) => t.trim()) : [];
  return <div className="gp-card gp-ai">
    <div className="gp-ai-head">
      <h3 className="gp-ai-title">{demo ? '조합 해설' : <><AiBotIcon />AI 해설</>} {demo && <span className="gp-badge gp-badge-muted">예시 문구</span>}</h3>
      {action}
    </div>
    {parts ? <>
      {parts.reason.trim() && <p className="gp-ai-lead">{parts.reason}</p>}
      {roles.length > 0 && <section className="gp-ai-part">
        <h4 className="gp-h4 gp-h4-roles">유형별 역할</h4>
        {/* 문단이 유형 이름으로 시작하면 그 유형 소제목을 붙인다(#398). 데모 조합 해설은 유형마다 나눈 글이 아니라 붙이지 않는다(#402) */}
        {roles.map((line, i) => {
          const type = !demo ? roleType(line, plan) : null;
          return <div key={i} className="gp-role">{type && <h5 className="gp-h5">{TYPE_LABEL[type]}</h5>}<p>{line}</p></div>;
        })}
      </section>}
    </> : <p className="gp-ai-lead">{plan.explanation}</p>}
    <section className="gp-ai-part">
      <h4 className="gp-h4">참고 해설</h4>
      {extra.map((t, i) => <p key={i}>{t}</p>)}
      <p>{plan.resultText}</p>
    </section>
    {!demo && <p className="gp-ai-notice">{AI_OUTLOOK_NOTICE}</p>}
  </div>;
}

/** 시나리오 하나의 상품 배분·예상 금액·해설. 방금 계산한 결과와 저장한 결과가 같이 쓴다. action은 해설 카드 머리 오른쪽(저장 버튼). */
function PlanDetail({ resultKey, plan, products, startDeposit, targetAmount, months, demo, action }: {
  resultKey: string; plan: GoalScenario; products: ScenarioProduct[]; startDeposit: StartDeposit | null; targetAmount: number | null; months: number;
  demo: boolean; action?: ReactNode;
}) {
  const productOf = (t: ScenarioProductType) => products.find((p) => p.type === t);
  const listId = useId();
  // 카테고리별 세부 상품 펼침. 처음엔 적금만 열고, 다른 플랜을 고르거나 다시 계산하면(결과가 바뀌면) 그 상태로 되돌린다.
  // 바뀐 렌더에서 바로 되돌려(이펙트가 아니라) 이전 상태가 한 번 그려졌다가 움직이지 않게 한다.
  const foldKey = `${resultKey}:${plan.id}`;
  const [fold, setFold] = useState<{ key: string; open: ScenarioProductType[] }>({ key: foldKey, open: DEFAULT_OPEN });
  if (fold.key !== foldKey) setFold({ key: foldKey, open: DEFAULT_OPEN });
  const open = fold.key === foldKey ? fold.open : DEFAULT_OPEN;
  const toggle = (t: ScenarioProductType) => setFold((cur) => ({ ...cur, open: cur.open.includes(t) ? cur.open.filter((x) => x !== t) : [...cur.open, t] }));
  const o = plan.outcome;
  return <>
    <div className="gp-detail">
      <div className="gp-card">
        <h3 className="gp-h3">어떤 상품에, 얼마씩? <span className="gp-badge gp-badge-muted">{demo ? '예시 비중' : 'AI 제안 비중'}</span></h3>
        <div className="gp-bar" role="img" aria-label={plan.mix.map((m) => `${TYPE_LABEL[m.type]} ${m.ratioPercent}%`).join(', ')}>
          {plan.mix.map((m) => <span key={m.type} style={{ width: `${m.ratioPercent}%`, background: COLORS[m.type] }} />)}
        </div>
        <ul className="gp-products">
          {plan.mix.map((m) => {
            const subs = subProducts(productOf(m.type), m.type);
            const isOpen = open.includes(m.type);
            const subId = `${listId}-${m.type}`;
            const dot = <span className="gp-dot" style={{ background: COLORS[m.type] }} />;
            const amt = <span className="gp-product-amt num">{m.monthly !== null ? `월 ${won(m.monthly)}원` : '-'}
              {m.start ? <small>시작 {won(m.start)}원</small> : null}</span>;
            const ratio = <span className="gp-product-pct num">{m.ratioPercent}%</span>;
            return <li key={m.type}>
              {subs.length > 0
                ? <button type="button" className="gp-product-toggle" aria-expanded={isOpen} aria-controls={subId} onClick={() => toggle(m.type)}>
                  {dot}
                  <span className="gp-product-name">{TYPE_LABEL[m.type]}<svg className="gp-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  {amt}{ratio}
                </button>
                : <>{dot}<span className="gp-product-name">{TYPE_LABEL[m.type]}</span>{amt}{ratio}</>}
              {subs.length > 0 && <div id={subId} className={`gp-subwrap${isOpen ? ' is-open' : ''}`}><ul className="gp-subproducts" aria-label={`${TYPE_LABEL[m.type]} 세부 상품`}>
                {subs.map((s) => <li key={s.key}>
                  <span className="gp-subproduct-name">{s.name}</span>
                  {s.meta && <span className="gp-subproduct-meta">{s.meta}</span>}
                  {s.basis && <span className="gp-badge gp-badge-muted">금액 계산 기준</span>}
                </li>)}
                {m.type === 'KOSPI_TOP5' && <li className="gp-subproduct-note">5종목에 같은 금액으로 나눠 넣어요</li>}
                {m.type === 'SAVINGS' && afterMaturity(productOf('SAVINGS'), months) && <li className="gp-subproduct-note">{afterMaturity(productOf('SAVINGS'), months)}</li>}
                {m.type === 'SAVINGS' && m.start ? <li className="gp-subproduct-note">{startDepositNote(m.start, startDeposit)}</li> : null}
              </ul></div>}
            </li>;
          })}
        </ul>
      </div>
      <div className="gp-card">
        <h3 className="gp-h3">{periodText(months)} 뒤 예상 금액 {plan.paid !== null && <span className="gp-badge gp-badge-muted">넣은 돈 {manwon(plan.paid)}</span>}</h3>
        {plan.series && plan.monthly !== null && <GrowthChart series={plan.series} monthly={plan.monthly} target={targetAmount} />}
        {!o
          ? <div className="gp-fixed">{plan.resultText}</div>
          : o.kind === 'FIXED' && o.fixedAmount !== null
            ? <div className="gp-fixed">이자가 정해진 상품만 있어 결과가 하나로 정해져요.<b className="num">{manwon(o.fixedAmount)}</b>
              {targetAmount !== null ? (o.fixedAmount >= targetAmount ? `목표 ${manwon(targetAmount)} 달성 · ` : `목표 ${manwon(targetAmount)}에 못 미침 · `) : ''}세후 이자 포함</div>
            : o.low !== null && o.median !== null && o.high !== null && <>
              <RangeBar low={o.low} median={o.median} high={o.high} target={targetAmount} />
              <div className="gp-range-legend">
                <div>하위 10%<b className="num">{manwon(o.low)}</b></div>
                <div className="gp-range-mid">중간값<b className="num">{manwon(o.median)}</b></div>
                <div>상위 10%<b className="num">{manwon(o.high)}</b></div>
              </div>
            </>}
      </div>
    </div>
    <AiCard plan={plan} demo={demo} action={action} />
  </>;
}

/** AI 해설 제목 앞 봇 아이콘. 테두리는 글자색, 눈 화면은 브랜드 색을 따라 다크 테마에서도 보인다. */
function AiBotIcon() {
  return <svg className="gp-ai-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <line x1="12" y1="2.6" x2="12" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="2.2" r="1.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <rect x="4" y="5" width="16" height="11" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <rect x="6.6" y="7.6" width="10.8" height="5.8" rx="2.9" fill="var(--color-brand-primary)" />
    <rect x="9.3" y="9.4" width="1.5" height="2.2" rx="0.75" fill="var(--color-on-brand)" />
    <rect x="13.2" y="9.4" width="1.5" height="2.2" rx="0.75" fill="var(--color-on-brand)" />
    <path d="M7.5 22v-1.5a4.5 4.5 0 0 1 9 0V22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
}

function Assumptions({ paths, returnsFrom, returnsTo, assumptions, notice }: { paths: number; returnsFrom: string; returnsTo: string; assumptions: string[]; notice: string }) {
  return <>
    <details className="gp-assumptions">
      <summary>계산 방법과 가정</summary>
      <ul>
        <li><b>{won(paths)}가지 경우</b>: {returnsFrom}부터 {returnsTo}까지 상품이 실제로 오르내린 기록을 1년 단위로 잘라, 무작위로 이어 붙여 만든 가상의 미래예요. 같은 입력이면 늘 같은 결과가 나와요.</li>
        <li><b>하위 10%·중간값·상위 10%</b>: {won(paths)}가지 결과를 줄 세웠을 때 아래에서 10%, 가운데, 위에서 10% 자리의 금액이에요. 그래프는 달마다 같은 방법으로 고른 값이라 한 경우를 따라간 선이 아니에요.</li>
        <li><b>상위 10%의 수익</b>: 상위 10% 금액에서 넣은 돈(시작 금액 + 월 금액 × 기간)을 뺀 값이에요. 적금·CMA만 있는 조합은 이자가 정해져 있어 결과가 하나예요.</li>
        <li><b>목표 달성 추정</b>: 목표 금액을 넣었을 때 기한 말 금액이 목표 이상인 경우의 비율이에요.</li>
        <li><b>원금 손실 가능성</b>: 넣은 돈보다 적게 남은 경우의 비율이에요.</li>
        {assumptions.map((a) => <li key={a}>{a}</li>)}
      </ul>
    </details>
    <p className="gp-foot">{notice}</p>
  </>;
}

/** 저장본·결과의 조건 한 줄: 기간 · 시작 금액 · 월 금액 · 목표. */
function conditionText(v: { months: number; startAmount: number; monthlyBudget: number | null; targetAmount: number | null }) {
  return [periodText(v.months), v.startAmount > 0 ? `시작 ${manwon(v.startAmount)}` : null, v.monthlyBudget !== null ? `월 ${won(v.monthlyBudget)}원` : null,
    v.targetAmount !== null ? `목표 ${manwon(v.targetAmount)}` : null].filter(Boolean).join(' · ');
}

/** 저장본 내용. 저장한 플랜이 먼저 열리고, 나머지 플랜이 있으면 선택 칸으로 바꿔 본다. 값은 저장할 때 그대로다. */
function SavedPlanView({ viewing, loading, onClose, onRecalc }: {
  viewing: SavedGoalScenario; loading: boolean; onClose: () => void; onRecalc: (v: SavedGoalScenario) => void;
}) {
  const [activeId, setActiveId] = useState(viewing.scenario.id);
  const plans = [viewing.scenario, ...viewing.alternatives];
  const plan = plans.find((p) => p.id === activeId) ?? viewing.scenario;
  return <div className="gp-view-body">
    <div className="gp-view-head">
      <div>
        <h2 id="gp-view-title" className="gp-view-name">{viewing.name}</h2>
        <p className="gp-view-meta">{plan.title} · {conditionText(viewing)} · {savedDate(viewing.savedAt)}에 저장
          <span className="gp-badge">{viewing.asOf} 기준 결과</span></p>
      </div>
      <button type="button" className="gp-text-btn" onClick={onClose} autoFocus>닫기</button>
    </div>
    {plans.length > 1 && <nav className="gp-view-rail" aria-label="플랜 선택">
      {plans.map((p) => <button type="button" key={p.id} className="gp-view-tab" aria-pressed={p.id === plan.id} onClick={() => setActiveId(p.id)}>{p.title}</button>)}
    </nav>}
    <PlanDetail resultKey={`saved-${viewing.id}`} plan={plan} products={viewing.products} startDeposit={viewing.startDeposit} targetAmount={viewing.targetAmount} months={viewing.months} demo={viewing.proposer === 'DEMO'} />
    <Assumptions paths={viewing.paths} returnsFrom={viewing.returnsFrom} returnsTo={viewing.returnsTo} assumptions={viewing.assumptions} notice={viewing.notice} />
    <div className="gp-view-actions">
      {viewing.monthlyBudget !== null && <button type="button" className="gp-secondary" onClick={() => onRecalc(viewing)} disabled={loading}>지금 시세로 다시 계산하기</button>}
      <button type="button" className="gp-text-btn" onClick={onClose}>닫기</button>
    </div>
  </div>;
}

/** 저장한 시나리오를 저장할 때 값 그대로 보여 주는 모달. Esc·[닫기]·바깥 클릭으로 닫는다. */
function SavedScenarioDialog({ viewing, loading, onClose, onRecalc }: {
  viewing: SavedGoalScenario | null; loading: boolean; onClose: () => void; onRecalc: (v: SavedGoalScenario) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (viewing && !d.open) {
      // 열려 있는 동안 페이지 스크롤을 잠근다(goal-plan.css). 스크롤바 자리는 global.css의 scrollbar-gutter가 비워 두어 뒤 화면이 밀리지 않는다.
      d.showModal();
    }
    if (!viewing && d.open) d.close();
  }, [viewing]);

  return <dialog ref={ref} className="gp-view-dialog" aria-labelledby="gp-view-title"
    onCancel={(e) => { e.preventDefault(); onClose(); }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    {viewing && <SavedPlanView key={viewing.id} viewing={viewing} loading={loading} onClose={onClose} onRecalc={onRecalc} />}
  </dialog>;
}

/** 저장할 이름을 받는 창(policies §7-8, 1~20자). */
function SaveNameDialog({ open, saving, error, onSave, onCancel }: {
  open: boolean; saving: boolean; error: string; onSave: (name: string) => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [local, setLocal] = useState('');
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName('');
      setLocal('');
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > GOAL_LIMITS.nameMax) { setLocal(`이름은 1~${GOAL_LIMITS.nameMax}자로 적어 주세요.`); return; }
    setLocal('');
    onSave(trimmed);
  };
  const message = local || error;
  return <dialog ref={ref} aria-labelledby="gp-save-title" onCancel={(e) => { e.preventDefault(); onCancel(); }}>
    <form className="dlg gp-save-dlg" onSubmit={submit} noValidate>
      <h2 id="gp-save-title">이 시나리오를 저장할까요?</h2>
      <p>나중에 알아보기 쉬운 이름을 붙여 주세요. 저장한 시나리오에서 그때 결과 그대로 다시 볼 수 있어요.</p>
      <label htmlFor="gp-save-name" className="gp-save-label">이름</label>
      <input id="gp-save-name" className="gp-save-input" value={name} maxLength={GOAL_LIMITS.nameMax} placeholder="예: 여행 자금" autoFocus
        aria-invalid={message ? true : undefined} aria-describedby={message ? 'gp-save-error' : undefined} onChange={(e) => setName(e.target.value)} />
      {message && <p id="gp-save-error" className="gp-error" role="alert">{message}</p>}
      <div className="acts">
        <button type="button" className="btn btn-line" onClick={onCancel}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </form>
  </dialog>;
}

/** 원 단위 입력칸. 쉼표를 넣어 보여 주고 숫자만 보관한다. */
function MoneyInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="gp-unit">
    <input id={id} className="num" inputMode="numeric" placeholder={placeholder} value={value}
      onChange={(e) => { const d = digits(e.target.value).slice(0, 10); onChange(d ? won(Number(d)) : ''); }} />
    <span>원</span>
  </div>;
}

export default function GoalScenarios() {
  const { status } = useSession();
  const { openLogin } = useLoginModal();
  const location = useLocation();
  const member = status === 'member';

  const [start, setStart] = useState('');
  const [budget, setBudget] = useState('');
  const [months, setMonths] = useState(36);
  const [target, setTarget] = useState('');
  const [result, setResult] = useState<GoalScenarioResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [savedList, setSavedList] = useState<SavedScenarioList | null>(null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
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
    setSavedPlanId(null);
    setNaming(false);
    setSaveMessage('');
  }, [member, refreshSaved]);

  const periodYears = Math.floor(months / 12);
  const periodMonths = months % 12;
  /** 기한은 6~60개월(policies §7-1). 연을 바꿔 범위를 벗어나면 가장 가까운 값으로 맞춘다. */
  const inRange = (total: number) => total >= GOAL_LIMITS.monthsMin && total <= GOAL_LIMITS.monthsMax;
  const setPeriod = (total: number) => setMonths(Math.min(GOAL_LIMITS.monthsMax, Math.max(GOAL_LIMITS.monthsMin, total)));

  const run = async (q: { startAmount: number | null; monthlyBudget: number | null; months: number; targetAmount: number | null }) => {
    if (q.startAmount === null || q.startAmount > GOAL_LIMITS.startMax) { setError('시작 금액은 0원부터 10억 원까지 넣어 주세요. 없으면 0을 넣어 주세요.'); return; }
    if (q.monthlyBudget === null || q.monthlyBudget < GOAL_LIMITS.budgetMin || q.monthlyBudget > GOAL_LIMITS.budgetMax || q.monthlyBudget % GOAL_LIMITS.budgetUnit !== 0) {
      setError('월 납입 가능액은 1만 원부터 1,000만 원까지 천 원 단위로 넣어 주세요.');
      return;
    }
    if (q.months < GOAL_LIMITS.monthsMin || q.months > GOAL_LIMITS.monthsMax) { setError('기한은 6개월부터 5년까지 정할 수 있어요.'); return; }
    if (q.targetAmount !== null && (q.targetAmount < GOAL_LIMITS.targetMin || q.targetAmount > GOAL_LIMITS.targetMax)) {
      setError('목표 금액은 100만 원부터 10억 원까지 넣을 수 있어요. 없으면 비워 두세요.');
      return;
    }
    setError('');
    setSaveMessage('');
    setLoading(true);
    const id = ++requestId.current;
    try {
      const r = await fetchGoalScenarios({ startAmount: q.startAmount, monthlyBudget: q.monthlyBudget, months: q.months, ...(q.targetAmount !== null && { targetAmount: q.targetAmount }) });
      if (id !== requestId.current) return;
      setResult(r);
      setSavedPlanId(null);
      setViewing(null);
      setSelected(r.scenarios.find((s) => s.id === 'balanced')?.id ?? r.scenarios[0]?.id ?? null);
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

  const numberOrNull = (s: string) => (digits(s) ? Number(digits(s)) : null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run({ startAmount: numberOrNull(start), monthlyBudget: numberOrNull(budget), months, targetAmount: numberOrNull(target) });
  };

  const plan = result?.scenarios.find((s) => s.id === selected) ?? null;
  const demo = result?.proposer === 'DEMO';
  const full = !!savedList && savedList.items.length >= savedList.limit;

  const askSave = () => {
    if (!result || !plan) return;
    if (!member) { openLogin(location.pathname); return; }
    setSaveError('');
    setNaming(true);
  };

  const save = async (name: string) => {
    if (!result || !plan) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveScenario({ resultId: result.resultId, scenarioId: plan.id, name });
      setSavedPlanId(plan.id);
      setNaming(false);
      setSaveMessage(`'${name}'(으)로 저장했어요. 저장한 시나리오에서 다시 볼 수 있어요.`);
      void refreshSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'GOAL_SCENARIO_LIMIT') setSaveError('시나리오는 5개까지 저장할 수 있어요. 저장한 시나리오에서 하나를 지운 뒤 다시 저장해 주세요.');
      else if (err instanceof ApiError && err.code === 'GOAL_SCENARIO_EXPIRED') setSaveError('계산한 지 30분이 지나 저장할 수 없어요. [시나리오 보기]로 다시 계산해 주세요.');
      else setSaveError(errorText(err, '저장하지 못했어요'));
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
    setStart(won(v.startAmount));
    setBudget(v.monthlyBudget !== null ? won(v.monthlyBudget) : '');
    setMonths(v.months);
    setTarget(v.targetAmount !== null ? won(v.targetAmount) : '');
    void run({ startAmount: v.startAmount, monthlyBudget: v.monthlyBudget, months: v.months, targetAmount: v.targetAmount });
  };

  const saveButton = result && plan && <span className="gp-save-slot">
    <button type="button" className="gp-secondary" onClick={askSave} disabled={saving || savedPlanId === plan.id || (member && full)}>
      {!member ? '로그인하고 저장' : savedPlanId === plan.id ? '저장했어요' : '저장'}
    </button>
    {member && savedList && <span className="gp-save-count">{savedList.items.length}/{savedList.limit}</span>}
  </span>;

  return <div className="gp-page">
    <div className={`gp-wrap ${member ? 'gp-wrap-side' : ''}`}>
      <div className="gp-crumb">AI 목표 달성 {(!result || result.isSample) && <span className="gp-badge">예시 포함</span>}</div>
      <h1 className="gp-title">넣을 수 있는 돈만 알려 주세요.<br />불리는 방법은 AI가 같이 찾아 볼게요.</h1>
      <p className="gp-lead">시작 금액과 매달 넣을 돈으로 안정·균형·적극 세 가지 방법에 나눠 넣으면 기한 뒤 얼마가 될지 비교해 보세요.</p>

      <div className={member ? 'gp-layout' : undefined}>
      <div className="gp-main">

      <section aria-labelledby="gp-form-title">
        <h2 id="gp-form-title" className="gp-h2"><span className="gp-step">1</span>나의 조건</h2>
        <p className="gp-sub">시작 금액·월 납입 가능액·기한을 넣어 주세요. 목표 금액은 넣지 않아도 돼요. 마음에 드는 시나리오는 로그인하고 저장할 수 있어요.</p>
        <form className="gp-card" onSubmit={submit} noValidate>
          <div className="gp-form">
            <div className="gp-field">
              <label htmlFor="gp-start">시작 금액</label>
              <MoneyInput id="gp-start" value={start} onChange={setStart} placeholder="예: 1,000,000" />
            </div>
            <div className="gp-field">
              <label htmlFor="gp-budget">월 납입 가능액</label>
              <MoneyInput id="gp-budget" value={budget} onChange={setBudget} placeholder="예: 500,000" />
            </div>
            <div className="gp-field">
              <label htmlFor="gp-years">목표 기한</label>
              <div className="gp-period">
                <select id="gp-years" aria-label="목표 기한 연" value={periodYears} onChange={(e) => setPeriod(Number(e.target.value) * 12 + periodMonths)}>
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select aria-label="목표 기한 개월" value={periodMonths} onChange={(e) => setPeriod(periodYears * 12 + Number(e.target.value))}>
                  {MONTH_OPTIONS.map((m) => <option key={m} value={m} disabled={!inRange(periodYears * 12 + m)}>{m}개월</option>)}
                </select>
              </div>
            </div>
            <div className="gp-field">
              <label htmlFor="gp-target">목표 금액 <small>(선택)</small></label>
              <MoneyInput id="gp-target" value={target} onChange={setTarget} placeholder="예: 30,000,000" />
            </div>
            <button type="submit" className="gp-primary" disabled={loading}>{loading ? '계산 중…' : '시나리오 보기'}</button>
          </div>
          {error && <p className="gp-error" role="alert">{error}</p>}
        </form>
      </section>

      {loading && <div className="gp-loading" role="status"><span className="gp-spinner" />세 가지 조합으로 2,000가지 경우를 계산하고 있어요…</div>}

      <div ref={resultRef}>
        {result && plan && !loading && <section aria-labelledby="gp-result-title">
          <h2 id="gp-result-title" className="gp-h2"><span className="gp-step">2</span>{demo ? '세 가지 방법' : 'AI가 고른 방법'}
            {demo && <span className="gp-badge gp-badge-muted">예시 조합</span>}
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
          {result.months <= 12 && <p className="gp-insight">기한이 짧으면 투자를 섞어도 결과가 크게 달라지지 않아요. 오르내림을 회복할 시간이 부족해서예요.</p>}

          <div className="gp-plans">
            {result.scenarios.map((s, i) => <button type="button" key={s.id} className="gp-plan" aria-pressed={selected === s.id} onClick={() => { setSelected(s.id); setSaveMessage(''); }}>
              <span className="gp-plan-tag">PLAN 0{i + 1}{savedPlanId === s.id && <span className="gp-saved-mark">저장함</span>}</span>
              <span className="gp-plan-title">{s.title}</span>
              {s.outcome && s.outcome.highGain !== null && <>
                <span className="gp-plan-label">{s.outcome.kind === 'FIXED' ? '확정 수익(세후 이자)' : '상위 10%의 수익'}</span>
                <span className={`gp-plan-monthly num${s.outcome.highGain < 0 ? ' is-loss' : ''}`}>{gainText(s.outcome.highGain)}</span>
              </>}
              <span className="gp-mini" aria-hidden="true">{s.mix.map((m) => <span key={m.type} style={{ width: `${m.ratioPercent}%`, background: COLORS[m.type] }} />)}</span>
              {s.outcome && <span className="gp-plan-stats">
                <span>목표 달성 추정<b>{s.outcome.chanceBp === null ? '목표 없음' : pct(s.outcome.chanceBp)}</b></span>
                <span>원금 손실 가능성<b>{s.outcome.kind === 'FIXED' ? '없음' : pct(s.outcome.lossBp)}</b></span>
              </span>}
            </button>)}
          </div>

          <PlanDetail resultKey={result.resultId} plan={plan} products={result.products} startDeposit={result.startDeposit} targetAmount={result.targetAmount} months={result.months} demo={demo} action={saveButton} />
          {member && full && savedPlanId === null && <p className="gp-save-note">5개가 다 찼어요. 저장한 시나리오에서 하나를 지우면 저장할 수 있어요.</p>}
          {saveMessage && <p className="gp-save-message" role="status">{saveMessage}</p>}

          <Assumptions paths={result.paths} returnsFrom={result.returnsFrom} returnsTo={result.returnsTo} assumptions={result.assumptions} notice={result.notice} />
        </section>}
      </div>

      <SavedScenarioDialog viewing={viewing} loading={loading} onClose={() => setViewing(null)}
        onRecalc={(v) => { setViewing(null); recalc(v); }} />
      <SaveNameDialog open={naming} saving={saving} error={saveError} onSave={(n) => void save(n)} onCancel={() => setNaming(false)} />

      </div>
      {member && <aside className="gp-saved" aria-labelledby="gp-saved-title">
        <h2 id="gp-saved-title" className="gp-h2">저장한 시나리오
          {savedList && <span className="gp-badge gp-badge-muted">{savedList.items.length}/{savedList.limit}</span>}</h2>
        <p className="gp-sub">저장할 때의 결과를 그대로 보여 줘요.</p>
        {listError && <p className="gp-error" role="alert">{listError}</p>}
        {savedList && savedList.items.length === 0 && <div className="gp-card gp-saved-empty">아직 저장한 시나리오가 없어요.</div>}
        {savedList && savedList.items.length > 0 && <ul className="gp-saved-list">
          {savedList.items.map((s) => <li key={s.id} className={`gp-card gp-saved-item gp-saved-item-side ${viewing?.id === s.id ? 'is-open' : ''}`}>
            <div className="gp-saved-main">
              <b className="gp-saved-name">{s.name}</b>
              <span>{s.title} · {conditionText(s)}</span>
              <small>{s.asOf} 기준 · {savedDate(s.savedAt)} 저장</small>
            </div>
            <div className="gp-saved-actions">
              <button type="button" className="gp-text-btn" onClick={() => void open(s.id)} aria-label={`${s.name} ${s.title} 보기`}>보기</button>
              <button type="button" className="gp-text-btn gp-danger" onClick={() => setToDelete(s.id)} aria-label={`${s.name} ${s.title} 지우기`}>지우기</button>
            </div>
          </li>)}
        </ul>}
        {savedList && savedList.items.length > 0 && <p className="gp-saved-foot">지금 시세로 보려면 [다시 계산하기]를 눌러 주세요.</p>}
      </aside>}
      </div>

      <ConfirmDialog open={toDelete !== null} title="저장한 시나리오를 지울까요?" confirmLabel="지우기" danger onConfirm={() => void remove()} onCancel={() => setToDelete(null)}>
        지운 시나리오는 되돌릴 수 없어요.
      </ConfirmDialog>
    </div>
  </div>;
}

