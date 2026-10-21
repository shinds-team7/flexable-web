// 투자 시뮬레이션(주식 타임머신). 와이어프레임 #scr-stocks를 옮겼다.
// 왼쪽(#tmConditions)은 코스피·코스닥·ETF 시가총액 상위 종목 목록, 오른쪽(#tmMain) 위는 조건, 아래는 결과.
// 종목 목록·금액·주별 평가액은 모두 서버(backend/, POST /simulations/run)가 계산한다. 화면은 그리기만 한다(ADR-3).
// 한 주의 값 = 그 주 마지막 거래일 종가로 평가한 금액. 사건 핀·사건 목록은 사건 API가 생기면 붙인다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChartData } from '@/charts/drawTimeChart';
import { SeriesKey } from '@/charts/SeriesKey';
import { TimeChart } from '@/charts/TimeChart';
import { EventPanel, eventPeriod } from '@/components/EventPanel';
import { Icon } from '@/components/Icons';
import { useSeedMoney } from '@/data/home';
import { useBoard, useSimulation, type Board, type FundingMode, type Instrument, type SimPoint, type SimulationRequest, type SimulationResult } from '@/data/market';
import { ApiError, errorText } from '@/lib/api';
import { fmtDate, krShort, pctTxt, signWon, upDown, won } from '@/lib/format';

const MAX_LEGS = 3;
const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
const BOARDS: { v: Board; label: string }[] = [
  { v: 'KOSPI', label: '코스피' },
  { v: 'KOSDAQ', label: '코스닥' },
  { v: 'ETF', label: 'ETF' },
];
const HOW: { v: FundingMode; label: string; desc: string }[] = [
  { v: 'LUMP_SUM', label: '한 번에', desc: '시작한 달 첫 거래일에 전부 넣어요' },
  { v: 'SPLIT', label: '매달 나눠서', desc: '정한 금액을 매달 첫 거래일에 똑같이 넣어요' },
  { v: 'PACE', label: '지금 저축 속도로', desc: '정산 주기마다 평균 남긴 돈을 매달 넣어요' },
];
type StartChip = 1 | 3 | 5 | 'custom';

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const yearsAgo = (y: number) => {
  const d = new Date();
  return ymOf(new Date(d.getFullYear() - y, d.getMonth(), 1));
};
const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const ymText = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${y}년 ${m}월`;
};
const digits = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0;
const withComma = (v: string) => {
  const n = v.replace(/[^\d]/g, '');
  return n ? Number(n).toLocaleString('ko-KR') : '';
};
/** 같은 비율로 나눈 정수 %. 나머지는 첫 종목에(서버 배분 규칙과 같음). */
const equalSplit = (n: number) => Array.from({ length: n }, (_, j) => Math.floor(100 / n) + (j === 0 ? 100 % n : 0));
const weightProblem = (w: number[]) => {
  const sum = w.reduce((a, b) => a + b, 0);
  if (w.some((x) => !Number.isInteger(x) || x < 1)) return '비율은 종목마다 1% 이상 넣어 주세요';
  if (sum !== 100) return `비율의 합이 100%가 되게 넣어 주세요(지금 ${sum}%)`;
  return null;
};
const capText = (n: number | null) => (n == null ? '' : n >= 1e12 ? `${(n / 1e12).toFixed(1)}조` : krShort(n));

/** 사건 시작일이 들어 있는 주의 번호(시계열 칸). 범위 밖이면 -1. */
function eventIdx(r: SimulationResult, startDate: string) {
  for (let i = r.series.length - 1; i >= 0; i--) if (r.series[i].weekStart <= startDate) return i;
  return -1;
}

function toChart(r: SimulationResult): ChartData {
  return {
    dates: r.series.map((p) => parseDay(p.weekStart)),
    heads: r.series.map((p) =>
      p.date && p.tradingDays > 0 ? `${fmtDate(parseDay(p.date))} 종가 · 거래일 ${p.tradingDays}일` : `${fmtDate(parseDay(p.weekStart))} 주 · 거래일 없음(직전 종가)`,
    ),
    tipTitle: '주 마지막 거래일 종가 기준',
    total: r.series.map((p) => p.total),
    invested: r.series.map((p) => p.invested),
    legs: r.legs.map((l, j) => ({
      name: l.name,
      color: COLORS[j],
      values: r.series.map((p) => p.legs[j].value),
      invested: r.series.map((p) => p.legs[j].invested),
    })),
    startIdx: 0,
    // 핀: 사건 기간 등락률과 그때 내 돈(서버 계산). 시장 사건은 leg=null
    events: r.events.flatMap((e) => {
      const idx = eventIdx(r, e.startDate);
      if (idx < 0) return [];
      const leg = e.code == null ? -1 : r.legs.findIndex((l) => l.id === e.code);
      return [
        {
          id: String(e.id),
          idx,
          kind: e.direction === 'RISE' ? ('rise' as const) : ('fall' as const),
          title: e.headline,
          leg: leg < 0 ? null : leg,
          sourceName: e.sourceCount > 0 ? `${e.sourceName} ${e.sourceCount}건` : '',
          change: { p: e.returnRate, before: e.valueBefore ?? 0, diff: e.valueChange ?? 0 },
          days: e.windowDays,
          period: eventPeriod(e),
        },
      ];
    }),
  };
}

export default function Invest() {
  const seed = useSeedMoney();
  const [board, setBoard] = useState<Board>('KOSPI');
  const listing = useBoard(board);
  const kospi = useBoard('KOSPI');
  const etf = useBoard('ETF');

  const [chip, setChip] = useState<StartChip>(3);
  const [start, setStart] = useState(() => yearsAgo(3));
  const [how, setHow] = useState<FundingMode>('PACE');
  const [lumpSrc, setLumpSrc] = useState<'seed' | 'manual'>('seed');
  const [lumpManual, setLumpManual] = useState('');
  const [monthly, setMonthly] = useState('100,000');
  const [picked, setPicked] = useState<Instrument[]>([]);
  const [weights, setWeights] = useState<number[]>([]); // picked와 같은 순서, 정수 %
  const [weightOpen, setWeightOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [req, setReq] = useState<SimulationRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const sim = useSimulation(req);
  const searchRef = useRef<HTMLInputElement>(null);

  const seedTotal = seed.data?.manual ?? seed.data?.confirmed ?? 0;
  const seedPace = seed.data?.avgPerCycle ?? 0;
  const amount = how === 'LUMP_SUM' ? (lumpSrc === 'seed' ? seedTotal : digits(lumpManual)) : how === 'SPLIT' ? digits(monthly) : seedPace;

  /** 종목이 바뀌면 비율을 1/N로 다시 맞춘다. */
  const setLegs = (list: Instrument[]) => {
    setPicked(list);
    setWeights(equalSplit(list.length));
  };
  const toggle = (i: Instrument) => {
    if (picked.some((p) => p.id === i.id)) setLegs(picked.filter((p) => p.id !== i.id));
    else if (picked.length < MAX_LEGS) setLegs([...picked, i]);
  };

  const buildReq = (legs: Instrument[], w: number[]): SimulationRequest => ({
    startDate: `${start}-01`,
    funding: how === 'LUMP_SUM' ? { mode: how, totalAmount: amount } : { mode: how, monthlyAmount: amount },
    // 0.35처럼 소수 둘째 자리까지. 서버가 합이 정확히 1인지 검사한다.
    legs: legs.map((l, j) => ({ instrumentId: l.id, weight: w[j] / 100 })),
  });
  const run = (legs = picked, w = weights) => {
    if (legs.length === 0) {
      setReq(null);
      return;
    }
    if (amount <= 0) {
      setFormError('금액을 넣어 주세요');
      return;
    }
    const wp = weightProblem(w);
    if (wp) {
      setFormError(wp);
      return;
    }
    setFormError(null);
    setReq(buildReq(legs, w));
  };

  // 처음 열면 코스피 1위 + ETF 1위로 바로 계산해 보여 준다(와이어프레임 기본 상태).
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || !seed.data || !kospi.data || etf.isPending) return;
    booted.current = true;
    const first = [kospi.data.items[0], etf.data?.items[0]].filter((x): x is Instrument => !!x);
    setLegs(first);
    if (first.length) setReq(buildReq(first, equalSplit(first.length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed.data, kospi.data, etf.isPending]);

  const pickChip = (c: StartChip) => {
    setChip(c);
    if (c !== 'custom') setStart(yearsAgo(c));
  };
  const focusList = () => {
    setExpanded(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  return (
    <section>
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">주식 타임머신</h1>
            <p className="page-desc">내 시드머니를 지난 날짜로 보내 봐요. 과거 주가로 해보는 계산이에요.</p>
          </div>
        </div>
        <div className="sim no-rail">
          <aside className={'cond-col col' + (expanded ? ' expanded' : '')} id="tmConditions" aria-label="종목 목록">
            <div className="card cond-summary" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '16px 20px' }}>
              <span className="sub" style={{ fontSize: 14 }}>
                종목 {picked.length}개 고름
              </span>
              <button className="btn btn-line btn-sm" type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                {expanded ? '목록 닫기' : '종목 목록'}
              </button>
            </div>
            <StockList board={board} setBoard={setBoard} listing={listing} picked={picked} onToggle={toggle} searchRef={searchRef} />
          </aside>

          <div className="col" id="tmMain">
            <form
              className="card"
              id="tmFilters"
              aria-label="타임머신 조건"
              onSubmit={(e) => {
                e.preventDefault();
                run();
              }}
            >
              <div className="tm-filters">
                <div className="tm-field">
                  <span className="field-label">언제부터?</span>
                  <div className="seg fill" role="group" aria-label="시작 시점">
                    {([1, 3, 5] as const).map((y) => (
                      <button key={y} type="button" aria-pressed={chip === y} onClick={() => pickChip(y)}>
                        {y}년 전
                      </button>
                    ))}
                    <button type="button" aria-pressed={chip === 'custom'} onClick={() => pickChip('custom')}>
                      직접
                    </button>
                  </div>
                  <input
                    className="input"
                    type="month"
                    value={start}
                    min={yearsAgo(10)}
                    max={ymOf(new Date())}
                    aria-label="시작 월"
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setStart(e.target.value);
                      setChip('custom');
                    }}
                  />
                  <p className="meta">{ymText(start)} 첫 거래일부터 계산해요</p>
                </div>

                <div className="tm-field tm-how">
                  <span className="field-label">어떻게 넣을까?</span>
                  <div className="seg fill" role="group" aria-label="넣는 방식">
                    {HOW.map((h) => (
                      <button key={h.v} type="button" aria-pressed={how === h.v} onClick={() => setHow(h.v)}>
                        {h.label}
                      </button>
                    ))}
                  </div>
                  <div className="value-box desc">{HOW.find((h) => h.v === how)!.desc}</div>
                  <p className="meta">시세는 그 주 마지막 거래일 종가로 평가해요</p>
                </div>

                <div className="tm-field">
                  <span className="field-label">{how === 'LUMP_SUM' ? '얼마를?' : '매달 얼마?'}</span>
                  {how === 'LUMP_SUM' && (
                    <>
                      <div className="seg fill" role="group" aria-label="금액">
                        <button type="button" aria-pressed={lumpSrc === 'seed'} onClick={() => setLumpSrc('seed')}>
                          내 시드머니
                        </button>
                        <button type="button" aria-pressed={lumpSrc === 'manual'} onClick={() => setLumpSrc('manual')}>
                          직접 입력
                        </button>
                      </div>
                      {lumpSrc === 'seed' ? (
                        <SeedValue amount={seedTotal} loading={!seed.data} sample={!!seed.data?.isSample} />
                      ) : (
                        <AmountInput value={lumpManual} onChange={setLumpManual} placeholder="470,000" label="넣을 금액(원)" />
                      )}
                      <p className="meta">{lumpSrc === 'seed' ? '앱에 입력한 기록으로 모은 돈이에요' : '1만 원 ~ 1억 원'}</p>
                    </>
                  )}
                  {how === 'SPLIT' && (
                    <>
                      <div className="seg fill" role="group" aria-label="자주 쓰는 금액">
                        {[100_000, 300_000, 500_000, 1_000_000].map((v) => (
                          <button key={v} type="button" aria-pressed={digits(monthly) === v} onClick={() => setMonthly(v.toLocaleString('ko-KR'))}>
                            {v / 10_000}만
                          </button>
                        ))}
                      </div>
                      <AmountInput value={monthly} onChange={setMonthly} placeholder="100,000" label="매달 넣을 금액(원)" />
                      <p className="meta">매달 1천 원 ~ 1천만 원</p>
                    </>
                  )}
                  {how === 'PACE' && (
                    <>
                      <div className="seg-note">
                        앱 기록 기준 {seed.data?.isSample && <span className="tag-ex">예시</span>}
                      </div>
                      <SeedValue amount={seedPace} loading={!seed.data} sample={false} prefix="매달" />
                      <p className="meta">정산 주기마다 평균 남긴 돈을 그대로 넣어요</p>
                    </>
                  )}
                </div>

                <div className="tm-field wide">
                  <span className="field-label">
                    어떤 종목? <span className="muted" style={{ fontWeight: 500 }}>(최대 {MAX_LEGS}개 · 왼쪽 목록에서 골라요)</span>
                  </span>
                  <div className="tm-picked-row">
                    <div className="chips" id="tmPicked">
                      {picked.map((p, j) => (
                        <span key={p.id} className="chip" style={{ background: 'var(--card)', borderColor: 'var(--line)', height: 36 }}>
                          <SeriesKey index={j} color={COLORS[j]} />
                          {p.name}
                          <b className="num" style={{ color: 'var(--text)' }}>{weights[j]}%</b>
                          <button type="button" className="btn-text" aria-label={`${p.name} 빼기`} style={{ color: 'var(--text-muted)' }} onClick={() => toggle(p)}>
                            ×
                          </button>
                        </span>
                      ))}
                      <button type="button" className="chip" style={{ height: 36 }} disabled={picked.length >= MAX_LEGS} onClick={focusList}>
                        + 종목 추가
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Link className="lock" to="/plus" title="4·5번째 종목 칸">
                        <Icon id="i-lock" size={12} />
                        4·5번째 칸 · 플러스
                      </Link>
                      <button type="button" className="btn btn-line btn-sm" disabled={picked.length < 2} onClick={() => setWeightOpen(true)}>
                        비율 수정
                      </button>
                    </div>
                  </div>
                  <p className="meta">고르면 비율은 1/{Math.max(1, picked.length)}로 나눠요. 비율 수정에서 바꿀 수 있어요.</p>
                </div>

                <div className="tm-actions wide">
                  <details style={{ border: 0, padding: 0 }}>
                    <summary className="meta" style={{ fontWeight: 700 }}>
                      고급 설정
                    </summary>
                    <p className="meta">기본 결과: 배당 재투자·세금·수수료 미반영</p>
                    <Link className="lock" to="/plus">
                      정밀 모드 · 플러스
                    </Link>
                  </details>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {formError && (
                      <span className="meta" role="alert" style={{ color: 'var(--danger)' }}>
                        {formError}
                      </span>
                    )}
                    <button type="submit" className="btn btn-primary" style={{ minWidth: 140 }} disabled={picked.length === 0 || sim.isFetching}>
                      {sim.isFetching ? '계산하는 중…' : '결과 보기'}
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <Result
              req={req}
              sim={sim}
              picked={picked}
              onDropAndRun={(id) => {
                const next = picked.filter((p) => p.id !== id);
                setLegs(next);
                run(next, equalSplit(next.length));
              }}
            />
          </div>
        </div>
      </div>
      {weightOpen && (
        <WeightDialog
          picked={picked}
          weights={weights}
          onClose={() => setWeightOpen(false)}
          onSave={(w) => {
            setWeights(w);
            setWeightOpen(false);
            if (req) run(picked, w);
          }}
        />
      )}
    </section>
  );
}

function AmountInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <input className="input num" inputMode="numeric" placeholder={placeholder} aria-label={label} value={value} onChange={(e) => onChange(withComma(e.target.value))} style={{ paddingRight: 34, fontWeight: 700, fontSize: 16 }} />
      <span className="meta" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
        원
      </span>
    </div>
  );
}

/** 앱 기록에서 온 금액(읽기 전용). 입력칸과 같은 높이로 크게 보여 준다. */
function SeedValue({ amount, loading, sample, prefix }: { amount: number; loading: boolean; sample: boolean; prefix?: string }) {
  return (
    <div className="value-box" aria-live="polite">
      {loading ? (
        <span className="meta">불러오는 중</span>
      ) : (
        <>
          <span>
            {prefix && <span className="pre">{prefix}</span>}
            <b className="num">{won(amount)}</b>원
          </span>
          {sample && <span className="tag-ex">예시</span>}
        </>
      )}
    </div>
  );
}

function StockList({
  board,
  setBoard,
  listing,
  picked,
  onToggle,
  searchRef,
}: {
  board: Board;
  setBoard: (b: Board) => void;
  listing: ReturnType<typeof useBoard>;
  picked: Instrument[];
  onToggle: (i: Instrument) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState('');
  const items = listing.data?.items ?? [];
  const term = q.trim().toLowerCase();
  const shown = term ? items.filter((i) => i.name.toLowerCase().includes(term) || i.id.toLowerCase().includes(term)) : items;
  const full = picked.length >= MAX_LEGS;

  return (
    <form className="card cond-full col" style={{ gap: 12 }} aria-label="종목 고르기" onSubmit={(e) => e.preventDefault()}>
      <div>
        <h2 style={{ fontSize: 16 }}>종목 고르기</h2>
        <p className="meta">
          시가총액 상위 {items.length || 100}개 · 최대 {MAX_LEGS}개
        </p>
      </div>
      <div className="seg fill" role="group" aria-label="시장">
        {BOARDS.map((b) => (
          <button key={b.v} type="button" aria-pressed={board === b.v} onClick={() => setBoard(b.v)}>
            {b.label}
          </button>
        ))}
      </div>
      <input ref={searchRef} className="input" type="search" placeholder="종목 이름·코드 찾기" aria-label="종목 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      {full && <p className="meta">3개를 모두 골랐어요. 바꾸려면 하나를 빼 주세요.</p>}
      {listing.isPending && <p className="meta">종목을 불러오는 중이에요</p>}
      {listing.isError && (
        <div className="col" style={{ gap: 8 }}>
          <p className="meta">{errorText(listing.error)}</p>
          <button type="button" className="btn btn-line btn-sm" onClick={() => listing.refetch()}>
            다시 시도
          </button>
        </div>
      )}
      {listing.data && items.length === 0 && <p className="meta">아직 종목 목록을 모으지 않았어요. 시세 수집(worker)이 한 번 돌면 보여요.</p>}
      {listing.data && items.length > 0 && shown.length === 0 && <p className="meta">찾는 종목이 없어요</p>}
      {shown.length > 0 && (
        <ol className="tm-list" aria-label={`${BOARDS.find((b) => b.v === board)!.label} 시가총액 순`}>
          {shown.map((i) => {
            const on = picked.some((p) => p.id === i.id);
            return (
              <li key={i.id}>
                <button type="button" aria-pressed={on} disabled={!on && full} onClick={() => onToggle(i)} title={on ? '빼기' : '고르기'}>
                  <span className="rk">{i.rank}</span>
                  <span className="nm">
                    {i.name}
                    <span className="sub2">{i.id}</span>
                  </span>
                  <span className="cap">{on ? '✓ 고름' : capText(i.marketCap)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {listing.data?.source && (
        <p className="meta">
          {listing.data.source} · {listing.data.dataAsOf && `${listing.data.dataAsOf.replaceAll('-', '.')} 기준 `}시가총액{listing.data.note ? '(상장주식수 × 종가 어림값)' : ''} 순
          {listing.data.note && <span style={{ display: 'block' }}>{listing.data.note}</span>}
        </p>
      )}
    </form>
  );
}

function WeightDialog({ picked, weights, onClose, onSave }: { picked: Instrument[]; weights: number[]; onClose: () => void; onSave: (w: number[]) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<string[]>(() => weights.map(String));
  // dialog의 close 이벤트로 상태를 바꾸지 않는다: 개발 모드(StrictMode)는 effect를 두 번 돌려
  // 정리 단계의 close()가 onClose를 불러 열자마자 닫혔다. 닫기는 Esc·취소·바깥 클릭·저장에서만.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    d?.querySelector<HTMLInputElement>('input')?.select();
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  const nums = draft.map((x) => digits(x));
  const sum = nums.reduce((a, b) => a + b, 0);
  const problem = weightProblem(nums);

  return (
    <dialog
      ref={ref}
      aria-labelledby="weightTitle"
      onCancel={(e) => {
        e.preventDefault(); // Esc
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // 바깥(backdrop) 클릭
      }}
    >
      <form
        style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) onSave(nums);
        }}
      >
        <div>
          <h2 id="weightTitle" style={{ fontSize: 18 }}>
            종목 비율 수정
          </h2>
          <p className="meta">넣는 돈을 종목마다 몇 %씩 나눌지 정해요. 합이 100%여야 해요.</p>
        </div>
        <div>
          {picked.map((p, j) => (
            <label key={p.id} className="weight-row">
              <SeriesKey index={j} color={COLORS[j]} />
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ position: 'relative' }}>
                <input
                  className="input"
                  inputMode="numeric"
                  aria-label={`${p.name} 비율(%)`}
                  value={draft[j]}
                  onChange={(e) => setDraft((d) => d.map((x, k) => (k === j ? e.target.value.replace(/[^\d]/g, '').slice(0, 3) : x)))}
                  onFocus={(e) => e.target.select()}
                  style={{ height: 40, textAlign: 'right', paddingRight: 28 }}
                />
                <span className="meta" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  %
                </span>
              </span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="meta" role="status" style={problem ? { color: 'var(--danger)' } : undefined}>
            {problem ?? `합계 ${sum}%`}
          </span>
          <button type="button" className="btn-text meta" onClick={() => setDraft(equalSplit(picked.length).map(String))}>
            같은 비율로
          </button>
        </div>
        <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-line" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={problem != null}>
            저장
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Result({ req, sim, picked, onDropAndRun }: { req: SimulationRequest | null; sim: ReturnType<typeof useSimulation>; picked: Instrument[]; onDropAndRun: (id: string) => void }) {
  const r = sim.data;
  const chart = useMemo(() => (r ? toChart(r) : null), [r]);
  const [range, setRange] = useState<0 | 52 | 156>(0);
  // 묶음 핀을 눌러 확대한 구간(없으면 기간 버튼대로), 고른 사건
  const [zoom, setZoom] = useState<{ from: number; to: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [focusIds, setFocusIds] = useState<number[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'total' | 'byStock'>('total');
  const [showTable, setShowTable] = useState(false);

  if (picked.length === 0 && !req) {
    return (
      <div className="empty-box">
        <h3>종목을 하나 고르면 결과가 나와요</h3>
        <p className="sub">왼쪽 목록에서 고르세요. 처음이라면 ETF에서 대표 지수 상품부터 시작해 보세요.</p>
      </div>
    );
  }

  if (sim.isError) {
    const e = sim.error;
    const failed = e instanceof ApiError && e.code === 'MARKET_UNAVAILABLE' && e.field ? e.field : null;
    const name = failed ? (picked.find((p) => p.id === failed)?.name ?? failed) : null;
    const offline = e instanceof TypeError || (e instanceof ApiError && (e.status === 502 || e.status === 504));
    return (
      <div className="error-box" role="alert">
        <h3>{name ? `${name}의 주가를 불러오지 못했어요` : offline ? '시세 서버에 연결하지 못했어요' : errorText(e)}</h3>
        <p className="sub">
          {name && picked.length > 1
            ? `${e instanceof ApiError ? e.message + '. ' : ''}나머지 종목으로 먼저 계산할 수 있어요.`
            : name
              ? `${e instanceof ApiError ? e.message + '. ' : ''}시세 수집(worker)이 끝나면 다시 시도해 주세요.`
            : offline && import.meta.env.DEV
              ? 'backend 폴더에서 웹 백엔드(8080, local 프로필)를 켰는지 확인해 주세요.'
              : '잠시 뒤 다시 시도해 주세요.'}
        </p>
        <div className="toolbar">
          {name && picked.length > 1 && (
            <button type="button" className="btn btn-primary" onClick={() => onDropAndRun(failed!)}>
              빼고 계산
            </button>
          )}
          <button type="button" className="btn btn-line" onClick={() => sim.refetch()}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!r || !chart) {
    return (
      <div className="card" aria-busy="true">
        <p className="sub">과거 주가를 불러와 계산하는 중이에요…</p>
      </div>
    );
  }

  const N = r.series.length;
  // 표는 기간 버튼(1년·3년·전체)만 따르고 늘 최근 주까지 보여 준다. 묶음 핀 확대는 차트에만 적용한다
  const rangeFrom = range ? Math.max(0, N - 1 - range) : 0;
  const from = zoom ? zoom.from : rangeFrom;
  const to = zoom ? zoom.to : N - 1;
  const shownEvents = r.events.filter((e) => {
    const i = eventIdx(r, e.startDate);
    return i >= from && i <= to;
  });
  const legNames = Object.fromEntries(r.legs.map((l) => [l.id, l.name]));
  const pick = (id: number | null) => {
    setSel(id);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const when = ymText(r.resolvedInput.startDate.slice(0, 7));
  const names = r.legs.map((l) => l.name).join('·');
  const story =
    r.resolvedInput.mode === 'LUMP_SUM'
      ? `${when}에 ${won(r.totalInvested)}원을 ${names}에 한 번에 넣었다면`
      : `${when}부터 매달 ${won(r.monthlyAmount)}원씩(모두 ${won(r.totalInvested)}원) ${names}에 넣었다면`;
  const asOf = fmtDate(parseDay(r.dataAsOf));

  return (
    <div className="card" style={{ opacity: sim.isFetching ? 0.6 : 1 }}>
      <p className="story">{story}</p>
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat">
          <span className="lbl">넣은 돈</span>
          <p className="val num">{won(r.totalInvested)}원</p>
          <span className="meta">{r.contributionCount}번 넣음</span>
        </div>
        <div className="stat">
          <span className="lbl">{asOf} 평가액</span>
          <p className="val num">{won(r.finalValue)}원</p>
          <span className={'dl ' + upDown(r.returnRate)}>{pctTxt(r.returnRate)}</span>
        </div>
        <div className="stat">
          <span className="lbl">차이</span>
          <p className={'val num ' + upDown(r.profit)}>{signWon(r.profit)}</p>
          <span className="meta">세금·수수료 빼기 전</span>
        </div>
      </div>

      <div className="toolbar" style={{ margin: '20px 0 8px' }}>
        <div className="seg" role="group" aria-label="기간">
          {(
            [
              [52, '1년'],
              [156, '3년'],
              [0, '전체'],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              type="button"
              aria-pressed={!zoom && range === v}
              onClick={() => {
                setZoom(null);
                setRange(v);
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="보기">
          <button type="button" aria-pressed={mode === 'total'} onClick={() => setMode('total')}>
            합계
          </button>
          <button type="button" aria-pressed={mode === 'byStock'} onClick={() => setMode('byStock')}>
            종목별
          </button>
        </div>
        <span className="spacer" />
        <button type="button" className="btn btn-line btn-sm" aria-expanded={showTable} aria-controls="tmTable" onClick={() => setShowTable(!showTable)}>
          {showTable ? '표 닫기' : '표로 보기'}
        </button>
      </div>

      <div className="legend" style={{ marginBottom: 6 }}>
        {mode === 'total' ? (
          <>
            <span>
              <i style={{ color: 'var(--text)' }} />내 자산
            </span>
            <span>
              <i className="dash" style={{ color: 'var(--baseline)' }} />넣은 돈
            </span>
          </>
        ) : (
          <>
            {r.legs.map((l, j) => (
              <span key={l.id}>
                <SeriesKey index={j} color={COLORS[j]} />
                {l.name} {Math.round(l.weight * 100)}%
              </span>
            ))}
            <span>
              <i className="dash" style={{ color: 'var(--baseline)' }} />점선: 종목별 넣은 돈
            </span>
          </>
        )}
      </div>
      <TimeChart
        label={`${when}부터 주마다 내 자산 변화. 사건 핀은 화살표 키로 옮겨 다닐 수 있어요`}
        data={chart}
        from={from}
        to={to}
        mode={mode}
        height={400}
        selectedId={sel == null ? null : String(sel)}
        onSelect={(id) => {
          setFocusIds(null);
          pick(Number(id));
        }}
        onZoom={(a, b) => setZoom({ from: a, to: b })}
        onPickMany={(ids) => {
          setFocusIds(ids.map(Number));
          pick(null);
        }}
      />
      <p className="meta" style={{ marginTop: 6 }}>
        {zoom ? (
          <>
            이 기간을 확대했어요.{' '}
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                setZoom(null);
                setFocusIds(null);
              }}
            >
              전체 기간으로
            </button>
          </>
        ) : shownEvents.length > 0 ? (
          '▲▼ 핀은 크게 오르내린 때예요. 가까운 사건은 숫자 핀으로 묶었고, 핀에 포커스를 두고 ←/→로 옮겨 다닐 수 있어요.'
        ) : (
          '이 기간에는 크게 오르내린 때가 없어요.'
        )}
      </p>

      <div ref={panelRef} style={{ marginTop: 12 }}>
        <EventPanel events={shownEvents} names={legNames} selectedId={sel} onSelect={pick} focusIds={focusIds} onClearFocus={() => setFocusIds(null)} />
      </div>

      <div className="chart-foot">
        <p className="meta">
          주가: {r.sources[0]?.name} · 주 마지막 거래일 종가 · 종목 정보: {r.sources[1]?.name} · 사건 근거: 금융감독원 OpenDART · 기준일 {asOf}
        </p>
        <div className="disclaimer">
          <Icon id="i-info" size={16} />
          <span>{r.notice}</span>
        </div>
        <ul className="meta" style={{ margin: 0, paddingLeft: 18 }}>
          {r.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <div className="toolbar">
          <Link className="btn btn-line btn-sm" to="/savings">
            적금이었다면?
          </Link>
        </div>
      </div>

      {showTable && <ResultTable r={r} from={rangeFrom} to={N - 1} />}
    </div>
  );
}

/** 표: 월별(그 달 마지막 주 값) 또는 주별. 금액·손익·수익률은 서버 값이고, 월별의 "이번에 넣은 돈"만 그 달 주별 값을 더한다. */
function ResultTable({ r, from, to }: { r: SimulationResult; from: number; to: number }) {
  const [unit, setUnit] = useState<'month' | 'week'>('month');
  const rows = useMemo(() => {
    const all = r.series.slice(from, to + 1);
    if (unit === 'week') return all.map((p) => ({ p, label: fmtDate(parseDay(p.date ?? p.weekStart)), added: p.contributed, holiday: p.tradingDays === 0 }));
    // 월별: 주 마지막 거래일이 속한 달로 묶고, 그 달 마지막 주의 값을 쓴다
    const byMonth = new Map<string, { p: SimPoint; added: number }>();
    for (const p of all) {
      const key = (p.date ?? p.weekStart).slice(0, 7);
      byMonth.set(key, { p, added: (byMonth.get(key)?.added ?? 0) + p.contributed });
    }
    return [...byMonth.entries()].map(([ym, { p, added }]) => ({ p, label: ym.replace('-', '.'), added, holiday: false }));
  }, [r, from, to, unit]);
  const shown = [...rows].reverse();

  return (
    <section id="tmTable" style={{ marginTop: 20 }} aria-label="결과 표">
      <div className="toolbar">
        <h3 style={{ fontSize: 15 }}>기간별 내 돈</h3>
        <div className="seg" role="group" aria-label="표 단위">
          <button type="button" aria-pressed={unit === 'month'} onClick={() => setUnit('month')}>
            월별
          </button>
          <button type="button" aria-pressed={unit === 'week'} onClick={() => setUnit('week')}>
            주별
          </button>
        </div>
        <span className="spacer" />
        <span className="meta">{unit === 'month' ? '그 달 마지막 거래일 종가 기준' : '그 주 마지막 거래일 종가 기준'} · 최근부터</span>
      </div>
      <div className="tm-table-wrap">
        <table className="tm-table">
          <thead>
            <tr>
              <th scope="col">{unit === 'month' ? '월' : '날짜'}</th>
              <th scope="col" className="r">
                이번에 넣은 돈
              </th>
              <th scope="col" className="r">
                넣은 돈(누적)
              </th>
              <th scope="col" className="r">
                평가액
              </th>
              <th scope="col" className="r">
                손익
              </th>
              {r.legs.map((l, j) => (
                <th key={l.id} scope="col" className="r">
                  <SeriesKey index={j} color={COLORS[j]} />
                  {l.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ p, label, added, holiday }) => {
              return (
                <tr key={p.weekStart}>
                  <td className="nw">
                    {label}
                    {holiday && <span className="sm">휴장 주(직전 종가)</span>}
                  </td>
                  <td className={'r' + (added > 0 ? ' paid' : '')}>{added > 0 ? `+${won(added)}원` : '—'}</td>
                  <td className="r">{won(p.invested)}원</td>
                  <td className="r" style={{ fontWeight: 700 }}>
                    {won(p.total)}원
                  </td>
                  <td className={'r ' + upDown(p.profit)}>
                    {signWon(p.profit)}
                    <span className="sm">{pctTxt(p.returnRate)}</span>
                  </td>
                  {p.legs.map((l) => (
                    <td key={l.id} className="r">
                      {won(l.value)}원<span className="sm">{l.close != null ? `종가 ${won(l.close)}원` : '시세 없음'}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
