// 투자 인사이트(/invest). 시장 띠·종목의 지난 주가·사건 핀·시가총액·업종별 순위를 본다(decisions/2026-10-26-invest-insight-redesign).
// 위는 흐르는 시장 띠(국내외 지수·금·환율 중 수집된 칸), 왼쪽(#tmConditions)은 종목 순위([시가총액 | 업종별] 탭, 종목 고르기), 오른쪽은 주가 차트.
// 차트의 세로축은 주가(원)다. 금액을 넣어 보는 계산은 투자 시뮬레이션(/simulation)이 맡고 이 화면에는 없다. 종가·사건·순위는 모두 서버 값이다(ADR-3).
// 종목을 하나 고르면 큰 차트, 둘 이상(최대 3개)이면 종목마다 축이 따로 있는 작은 차트를 나란히 둔다. 핀을 누르면 공통 상세 패널 하나가 열린다.
// 첫 방문(F5)이면 안내 모달 1장([차트 보기])과 투자 성향 선택(아직 안 골랐을 때)을 먼저 띄우고, 닫은 뒤 시가총액 1위·3개월 차트를 그린다.
// 4단계 둘러보기는 [사용법 보기](또는 /invest?tour=1, 내 정보의 사용법 다시 보기)로만 연다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChartData } from '@/charts/drawTimeChart';
import { placePinNote, removePinNote } from '@/charts/pinNote';
import { TimeChart } from '@/charts/TimeChart';
import { CoachTour, type CoachStep } from '@/components/CoachTour';
import { CountUp } from '@/components/CountUp';
import { EventPanel, eventPeriod, type PanelEvent } from '@/components/EventPanel';
import { Icon } from '@/components/Icons';
import { MarketStrip } from '@/components/MarketStrip';
import { Reveal } from '@/components/Reveal';
import {
  useBoard,
  useIndices,
  useIndustries,
  usePriceEvents,
  usePrices,
  type Board,
  type Instrument,
  type PriceEvent,
  type PricePeriod,
  type PriceSeries,
} from '@/data/market';
import { useFirstVisit } from '@/data/tour';
import { setInvestorType, useInvestorType } from '@/data/investorType';
import { TypeChoices } from '@/pages/InvestorType';
import { ApiError, errorText } from '@/lib/api';
import { fmtDate, krShort, won } from '@/lib/format';

const MAX_PICKS = 3;
/** 시가총액 순위는 먼저 이만큼만 보이고 [더 보기]로 나머지를 연다(긴 목록 스크롤 줄이기) */
const FIRST_ROWS = 20;
const BOARDS: { v: Board; label: string }[] = [
  { v: 'KOSPI', label: '코스피' },
  { v: 'KOSDAQ', label: '코스닥' },
  { v: 'ETF', label: 'ETF' },
];
const PERIODS: { v: PricePeriod; label: string }[] = [
  { v: '3M', label: '3개월' },
  { v: '6M', label: '6개월' },
  { v: '1Y', label: '1년' },
  { v: '3Y', label: '3년' },
];
/** 첫 방문 안내의 과거 시세 고지(PRICE_PAST). 차트 아래 고지는 서버가 내려 주고, 차트 전 모달에만 같은 문장을 둔다(InsightDtos.PRICE_NOTICE와 같게) */
const PRICE_PAST = '지난 시세를 그대로 보여 줘요. 앞으로의 주가를 뜻하지 않고 이 종목을 사거나 팔라는 뜻이 아니에요.';
const TOUR: CoachStep[] = [
  {
    target: () => document.querySelector<HTMLElement>('.ii-strip'),
    title: '시장 흐름은 맨 위에서 봐요',
    body: '지수·금·환율의 마지막 값과 전일 대비예요. 마우스를 올리거나 [멈춤]을 누르면 멈춰요.',
  },
  {
    target: () => document.querySelector<HTMLElement>('.tm-stocks'),
    title: '종목은 여기서 골라요',
    body: '시가총액 순위와 업종별 순위를 탭으로 바꿔 봐요. 최대 3개까지 고르면 종목마다 차트가 하나씩 생겨요.',
  },
  {
    target: () => document.querySelector<HTMLElement>('.ii-chart-head') ?? document.querySelector<HTMLElement>('.ii-charts'),
    title: '기간을 바꿔 주가를 봐요',
    body: '세로축은 주가(원)예요. 3개월·6개월·1년·3년 중에서 골라요.',
  },
  {
    target: () => document.querySelector<HTMLElement>('.ii-charts .pin') ?? document.querySelector<HTMLElement>('.tm-ev'),
    title: '▲▼ 핀을 누르면 그때 일을 읽어요',
    body: '크게 오르거나 내린 때예요. 누르면 아래에서 공시 근거와 함께 정리해 보여 줘요.',
  },
];

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const capText = (n: number | null) => (n == null ? '' : n >= 1e12 ? `${(n / 1e12).toFixed(1)}조` : krShort(n));
/** 로고는 출처·상표 확인 전까지 쓰지 않고 이름 첫 글자로 대신한다(결정 ⑥) */
const initial = (name: string) => Array.from(name.trim())[0] ?? '?';

function Avatar({ name }: { name: string }) {
  return (
    <span className="ii-avatar" aria-hidden="true">
      {initial(name)}
    </span>
  );
}

/** 서버 종가·사건을 차트 모양으로. 계산 없이 옮기기만 한다. */
function toChart(p: PriceSeries, events: PriceEvent[]): ChartData {
  const closes = p.points.map((pt) => pt.close);
  return {
    dates: p.points.map((pt) => parseDay(pt.date)),
    heads: p.points.map((pt) => `${fmtDate(parseDay(pt.date))} 종가`),
    tipTitle: '일별 종가(수정주가)',
    total: closes,
    invested: [],
    legs: [{ name: p.name, color: 'var(--text)', values: closes, invested: [] }],
    startIdx: 0,
    events: events.flatMap((e) => {
      const idx = p.points.findIndex((pt) => pt.date >= e.startDate);
      if (idx < 0) return [];
      return [
        {
          id: String(e.id),
          idx,
          kind: e.direction === 'RISE' ? ('rise' as const) : ('fall' as const),
          title: e.headline,
          leg: e.code == null ? null : 0,
          sourceName: e.sourceCount > 0 ? `${e.sourceName} ${e.sourceCount}건` : '',
          change: { p: e.returnRate, before: 0, diff: 0 },
          days: e.windowDays,
          period: eventPeriod(e),
        },
      ];
    }),
  };
}

const asInstrument = (board: 'KOSPI' | 'KOSDAQ', i: { id: string; name: string; rank: number; marketCap: number | null }): Instrument => ({
  id: i.id,
  name: i.name,
  market: board,
  kind: 'STOCK',
  board,
  rank: i.rank,
  marketCap: i.marketCap,
});

export default function Invest() {
  const [board, setBoard] = useState<Board>('KOSPI');
  const listing = useBoard(board);
  const kospi = useBoard('KOSPI');
  const strip = useIndices();
  const [picked, setPicked] = useState<Instrument[]>([]);
  const [period, setPeriod] = useState<PricePeriod>('3M');
  const searchRef = useRef<HTMLInputElement>(null);
  const firstVisit = useFirstVisit('invest');
  const [pinHint, setPinHint] = useState(false);
  const [tourOn, setTourOn] = useState(false);
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<'cap' | 'industry'>('cap');

  // 훅 수를 고정하려고 최대 3칸을 늘 부른다(빈 칸은 부르지 않음)
  const ids = [0, 1, 2].map((k) => picked[k]?.id ?? null);
  const prices = [usePrices(ids[0], period), usePrices(ids[1], period), usePrices(ids[2], period)];
  const pins = [usePriceEvents(ids[0], period), usePriceEvents(ids[1], period), usePriceEvents(ids[2], period)];

  const toggle = (i: Instrument) => {
    if (picked.some((p) => p.id === i.id)) setPicked(picked.filter((p) => p.id !== i.id));
    else if (picked.length < MAX_PICKS) setPicked([...picked, i]);
  };

  // 처음 열면 시가총액 1위(코스피 1위)·3개월로 바로 그린다. 첫 방문이면 안내를 닫은 뒤에 그린다
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || firstVisit.state !== 'seen' || !kospi.data) return;
    booted.current = true;
    const first = kospi.data.items[0];
    if (first) setPicked([first]);
  }, [firstVisit.state, kospi.data]);

  /** 첫 방문 안내를 닫았다. ack=true면 [차트 보기]로 고지 확인까지 한 것 */
  const startFirst = (ack: boolean) => {
    setPinHint(true);
    firstVisit.done(ack);
  };

  // 내 정보의 [사용법 다시 보기](/invest?tour=1): 첫 차트가 나오면 둘러보기를 연다
  const firstReady = !!prices[0].data && !prices[0].isFetching;
  useEffect(() => {
    if (sp.get('tour') !== '1' || !firstReady) return;
    setTourOn(true);
    setSp({}, { replace: true });
  }, [sp, setSp, firstReady]);

  // [+ 종목 추가]: 시가총액 탭의 검색칸으로. 업종별 탭이었으면 탭을 바꾼 뒤 그려지고 나서 옮긴다
  const focusList = () => {
    setView('cap');
    requestAnimationFrame(() => requestAnimationFrame(() => searchRef.current?.focus()));
  };

  return (
    <section>
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">투자 인사이트</h1>
            <p className="page-desc">시장 흐름과 종목의 지난 주가, 그때 있었던 일을 한눈에 봐요.</p>
          </div>
          <button type="button" className="btn btn-line btn-sm" onClick={() => setTourOn(true)} disabled={!prices[0].data}>
            사용법 보기
          </button>
        </div>

        {strip.data && strip.data.items.length > 0 && (
          <Reveal className="ii-sec">
            <MarketStrip data={strip.data} />
          </Reveal>
        )}

        <Reveal order={1} className="ii-sec">
          <div className="sim no-rail">
            <aside className="col" id="tmConditions" aria-label="종목 순위">
              <StockList view={view} setView={setView} board={board} setBoard={setBoard} listing={listing} picked={picked} onToggle={toggle} searchRef={searchRef} />
            </aside>

            <div className="col">
              <Charts
                picked={picked}
                period={period}
                setPeriod={setPeriod}
                prices={prices}
                pins={pins}
                onRemove={toggle}
                onAdd={focusList}
                pinHint={pinHint}
                onPinSeen={() => setPinHint(false)}
              />
            </div>
          </div>
        </Reveal>
      </div>
      {firstVisit.state === 'show' && <IntroDialog onStart={startFirst} />}
      {tourOn && <CoachTour steps={TOUR} onClose={() => setTourOn(false)} />}
    </section>
  );
}

function StockList({
  view,
  setView,
  board,
  setBoard,
  listing,
  picked,
  onToggle,
  searchRef,
}: {
  view: 'cap' | 'industry';
  setView: (v: 'cap' | 'industry') => void;
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
  const full = picked.length >= MAX_PICKS;
  const [more, setMore] = useState(false);
  const [indBoard, setIndBoard] = useState<'KOSPI' | 'KOSDAQ'>('KOSPI');
  const industries = useIndustries(indBoard, view === 'industry');
  // 찾는 중이면 맞는 종목을 모두, 아니면 먼저 FIRST_ROWS위까지
  const visible = term || more ? shown : shown.slice(0, FIRST_ROWS);
  // 시장이나 검색어가 바뀌면 목록을 맨 위(1위)부터 다시 보여 주고 접는다
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [board, term, view]);
  useEffect(() => setMore(false), [board]);

  const clear = () => {
    setQ('');
    searchRef.current?.focus();
  };

  return (
    <form className="card cond-full tm-stocks" aria-label="종목 고르기" onSubmit={(e) => e.preventDefault()}>
      <div className="tm-stocks-head">
        <div>
          <h2 className="tm-stocks-title">종목 순위</h2>
          <p className="meta">눌러서 차트에 최대 {MAX_PICKS}개</p>
        </div>
        <div className="seg fill ii-view" role="group" aria-label="순위 보기">
          <button type="button" aria-pressed={view === 'cap'} onClick={() => setView('cap')}>
            시가총액
          </button>
          <button type="button" aria-pressed={view === 'industry'} onClick={() => setView('industry')}>
            업종별
          </button>
        </div>
        {view === 'industry' ? (
          <div className="seg fill" role="group" aria-label="업종 시장">
            {(['KOSPI', 'KOSDAQ'] as const).map((b) => (
              <button key={b} type="button" aria-pressed={indBoard === b} onClick={() => setIndBoard(b)}>
                {b === 'KOSPI' ? '코스피' : '코스닥'}
              </button>
            ))}
          </div>
        ) : (
        <>
        <div className="seg fill" role="group" aria-label="시장">
          {BOARDS.map((b) => (
            <button key={b.v} type="button" aria-pressed={board === b.v} onClick={() => setBoard(b.v)}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="tm-search">
          <Icon id="i-search" size={16} />
          <input
            ref={searchRef}
            className="input"
            type="search"
            placeholder="종목 이름이나 코드로 찾기"
            aria-label="종목 찾기"
            aria-describedby="tmSearchCount"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && q) {
                e.preventDefault();
                setQ('');
              }
            }}
          />
          {q && (
            <button type="button" className="tm-search-clear" aria-label="검색어 지우기" onClick={clear}>
              <Icon id="i-close" size={14} />
            </button>
          )}
        </div>
        <p id="tmSearchCount" className="tm-search-count" role="status">
          {term && shown.length > 0 && (
            <>
              <b className="num">{shown.length}</b>개 찾음
            </>
          )}
        </p>
        </>
        )}
        {full && <p className="tm-note">3개를 모두 골랐어요. 바꾸려면 하나를 빼 주세요.</p>}
      </div>

      {view === 'industry' ? (
        <IndustryGroups q={industries} board={indBoard} picked={picked} onToggle={onToggle} />
      ) : (
      <>
      <div className="tm-stocks-body">
        {listing.isPending && (
          <ul className="tm-list" aria-hidden="true">
            {Array.from({ length: 8 }, (_, k) => (
              <li key={k} className="skel tm-skel-row" />
            ))}
          </ul>
        )}
        {listing.isError && (
          <div className="tm-list-state">
            <p className="meta">{errorText(listing.error)}</p>
            <button type="button" className="btn btn-line btn-sm" onClick={() => listing.refetch()}>
              다시 시도
            </button>
          </div>
        )}
        {listing.data && items.length === 0 && <p className="tm-list-state meta">아직 종목 목록을 모으지 않았어요. 시세 수집(worker)이 한 번 돌면 보여요.</p>}
        {listing.data && items.length > 0 && shown.length === 0 && (
          <div className="tm-list-state">
            <p className="sub">‘{q.trim()}’에 맞는 종목이 없어요</p>
            <p className="meta">이름이나 6자리 코드로 다시 찾거나, 다른 시장을 골라 보세요.</p>
            <button type="button" className="btn btn-line btn-sm" onClick={clear}>
              검색어 지우기
            </button>
          </div>
        )}
        {shown.length > 0 && (
          <ol ref={listRef} className="tm-list ii-rank" aria-label={`${BOARDS.find((b) => b.v === board)!.label} 시가총액 순`}>
            {visible.map((i) => {
              const on = picked.some((p) => p.id === i.id);
              return (
                <li key={i.id}>
                  <button type="button" aria-pressed={on} disabled={!on && full} onClick={() => onToggle(i)} title={on ? '차트에서 빼기' : '차트에 넣기'}>
                    <span className="rk">{i.rank}</span>
                    <Avatar name={i.name} />
                    <span className="nm">
                      {i.name}
                      <span className="sub2">{i.id}</span>
                    </span>
                    {on ? (
                      <span className="cap on">
                        <Icon id="i-check" size={14} />
                        차트
                      </span>
                    ) : (
                      <span className="cap">{capText(i.marketCap)}</span>
                    )}
                  </button>
                </li>
              );
            })}
            {!term && shown.length > FIRST_ROWS && (
              <li className="ii-more">
                <button type="button" className="btn btn-line btn-sm" aria-expanded={more} onClick={() => setMore(!more)}>
                  {more ? `${FIRST_ROWS}위까지만 보기` : `${FIRST_ROWS + 1}~${shown.length}위 더 보기`}
                </button>
              </li>
            )}
          </ol>
        )}
      </div>

      {listing.data?.source && (
        <p className="meta tm-stocks-foot">
          {listing.data.source} · {listing.data.dataAsOf && `${listing.data.dataAsOf.replaceAll('-', '.')} 기준 `}시가총액{listing.data.note ? '(상장주식수 × 종가 어림값)' : ''} 순
          {listing.data.note && <span className="tm-block">{listing.data.note}</span>}
        </p>
      )}
      </>
      )}
    </form>
  );
}

type PricesQuery = ReturnType<typeof usePrices>;
type PinsQuery = ReturnType<typeof usePriceEvents>;

function Charts({
  picked,
  period,
  setPeriod,
  prices,
  pins,
  onRemove,
  onAdd,
  pinHint,
  onPinSeen,
}: {
  picked: Instrument[];
  period: PricePeriod;
  setPeriod: (p: PricePeriod) => void;
  prices: PricesQuery[];
  pins: PinsQuery[];
  onRemove: (i: Instrument) => void;
  onAdd: () => void;
  /** 첫 방문 직후: 첫 핀 옆에 메모 1개 */
  pinHint: boolean;
  onPinSeen: () => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [focusIds, setFocusIds] = useState<number[] | null>(null);
  const [showTable, setShowTable] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 핀을 누르면 공통 상세 패널 하나. 시장 사건은 종목마다 같은 사건이라 한 번만 둔다
  const events = useMemo(() => {
    const byId = new Map<number, PanelEvent>();
    picked.forEach((_, k) => pins[k].data?.items.forEach((e) => byId.set(e.id, e)));
    return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, pins[0].data, pins[1].data, pins[2].data]);
  const names = Object.fromEntries(picked.map((p) => [p.id, p.name]));
  const pick = (id: number | null) => {
    setSel(id);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const series = picked.map((_, k) => prices[k].data).filter((x): x is PriceSeries => !!x);
  const head = series[0];

  if (picked.length === 0) {
    return (
      <div className="empty-box tm-empty">
        <svg className="tm-empty-art" viewBox="0 0 120 56" aria-hidden="true">
          <path d="M4 48 L28 36 L48 42 L72 22 L92 28 L116 8" />
        </svg>
        <h3>종목을 하나 고르면 주가 차트가 나와요</h3>
        <p className="sub">왼쪽 시가총액 순위나 아래 업종별 순위에서 골라 보세요.</p>
      </div>
    );
  }

  const many = picked.length > 1;
  return (
    <div className="card ii-charts">
      <div className="toolbar ii-chart-head">
        <div className="seg" role="group" aria-label="기간">
          {PERIODS.map((p) => (
            <button key={p.v} type="button" aria-pressed={period === p.v} onClick={() => setPeriod(p.v)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button type="button" className="btn btn-line btn-sm" disabled={picked.length >= MAX_PICKS} onClick={onAdd}>
          + 종목 추가
        </button>
        <button type="button" className="btn btn-line btn-sm" aria-expanded={showTable} aria-controls="iiTable" onClick={() => setShowTable(!showTable)} disabled={!head}>
          {showTable ? '표 닫기' : '표로 보기'}
        </button>
      </div>

      <div className={many ? 'ii-multiples' : 'ii-single'}>
        {picked.map((inst, k) => (
          <ChartCard
            key={inst.id}
            inst={inst}
            period={period}
            q={prices[k]}
            pinsQ={pins[k]}
            small={many}
            selectedId={sel}
            onRemove={many ? () => onRemove(inst) : undefined}
            pinHint={pinHint && k === 0}
            onPinSeen={onPinSeen}
            onSelect={(id) => {
              setFocusIds(null);
              pick(id);
            }}
            onPickMany={(ids) => {
              setFocusIds(ids);
              pick(null);
            }}
          />
        ))}
      </div>
      <p className="meta tm-chart-note">
        {events.length > 0
          ? '빨간 ▲ 핀은 크게 오른 때, 파란 ▼ 핀은 크게 내린 때예요. 가까운 사건 여러 개는 숫자 핀 하나로 묶었어요(누르면 그 기간을 확대). 핀에 포커스를 두고 ←/→로 옮겨 다닐 수 있어요.'
          : head
            ? '이 기간에는 크게 오르내린 때가 없어요.'
            : ''}
      </p>

      {events.length > 0 && (
        <div ref={panelRef} className="tm-ev">
          <EventPanel events={events} names={names} selectedId={sel} onSelect={pick} focusIds={focusIds} onClearFocus={() => setFocusIds(null)} />
        </div>
      )}

      {showTable && series.length > 0 && <MonthEndTable series={series} />}

      {head && (
        <div className="chart-foot tm-foot">
          <div className="disclaimer">
            <Icon id="i-info" size={16} />
            <span>{head.notice}</span>
          </div>
          <p className="meta">
            {series.some((s) => s.isSample) && <span className="tag-ex">예시</span>} 주가: {head.sources[0]?.name} · {head.sources[0]?.note} · 종목 정보:{' '}
            {head.sources[1]?.name} · 사건 근거: 금융감독원 OpenDART · 기준일 {fmtDate(parseDay(head.dataAsOf))}
          </p>
        </div>
      )}
    </div>
  );
}

function ChartCard({
  inst,
  period,
  q,
  pinsQ,
  small,
  selectedId,
  onRemove,
  pinHint,
  onPinSeen,
  onSelect,
  onPickMany,
}: {
  inst: Instrument;
  period: PricePeriod;
  q: PricesQuery;
  pinsQ: PinsQuery;
  small: boolean;
  selectedId: number | null;
  onRemove?: () => void;
  pinHint: boolean;
  onPinSeen: () => void;
  onSelect: (id: number) => void;
  onPickMany: (ids: number[]) => void;
}) {
  // 다른 종목·기간의 이전 값이 남아 있으면(placeholder) 이 종목 차트로 치지 않는다
  const p = q.data && q.data.id === inst.id ? q.data : null;
  const pe = pinsQ.data;
  const chart = useMemo(() => (p ? toChart(p, pe && pe.id === p.id && pe.period === p.period ? pe.items : []) : null), [p, pe]);
  // 묶음 핀을 눌러 확대한 구간. 기간·종목이 바뀌면 푼다
  const [zoom, setZoom] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => setZoom(null), [p]);
  const height = small ? 240 : 400;

  const header = (
    <div className="ii-card-head">
      <Avatar name={inst.name} />
      <div className="ii-card-title">
        <h3>{inst.name}</h3>
        {p && (
          <p className="meta num">
            {fmtDate(parseDay(p.endDate))} 종가 <b className="ii-last">
              <CountUp value={p.points[p.points.length - 1]?.close ?? 0} format={(n) => `${won(n)}원`} />
            </b>
            {p.isSample && <span className="tag-ex">예시</span>}
          </p>
        )}
      </div>
      {onRemove && (
        <button type="button" className="tm-chip-x ii-card-x" aria-label={`${inst.name} 차트 빼기`} onClick={onRemove}>
          <Icon id="i-close" size={14} />
        </button>
      )}
    </div>
  );

  if (q.isError && !p) {
    const e = q.error;
    const offline = e instanceof TypeError || (e instanceof ApiError && (e.status === 502 || e.status === 504));
    return (
      <div className="ii-card">
        {header}
        <div className="error-box tm-error" role="alert">
          <h3>
            <Icon id="i-info" size={18} />
            {e instanceof ApiError && e.status === 404 ? `${inst.name}의 주가를 아직 모으지 않았어요` : offline ? '시세 서버에 연결하지 못했어요' : errorText(e)}
          </h3>
          <p className="sub">
            {offline && import.meta.env.DEV ? 'backend 폴더에서 웹 백엔드(8080, local 프로필)를 켰는지 확인해 주세요.' : '시세 수집(worker)이 끝나면 다시 시도해 주세요.'}
          </p>
          <div className="toolbar">
            <button type="button" className="btn btn-line" onClick={() => q.refetch()}>
              다시 시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!p || !chart || chart.dates.length < 2) {
    return (
      <div className="ii-card" aria-busy="true">
        {header}
        <p className="sub">{p ? '이 기간에는 시세가 부족해요.' : '지난 주가를 불러오는 중이에요…'}</p>
        <div className="skel tm-skel-chart" style={{ height }} aria-hidden="true" />
      </div>
    );
  }

  const N = chart.dates.length;
  return (
    <div className={'ii-card' + (q.isFetching ? ' refetching' : '')} aria-busy={q.isFetching}>
      {header}
      <TimeChart
        label={`${inst.name} ${PERIODS.find((x) => x.v === period)!.label} 일별 종가(원). 사건 핀은 화살표 키로 옮겨 다닐 수 있어요`}
        data={chart}
        from={zoom ? zoom.from : 0}
        to={zoom ? zoom.to : N - 1}
        mode="price"
        height={height}
        compact={small}
        revealKey={`${inst.id}:${p.period}`}
        selectedId={selectedId == null ? null : String(selectedId)}
        afterDraw={pinHint ? (wrap) => placePinNote(wrap) : undefined}
        onHover={
          pinHint
            ? () => {
                removePinNote();
                onPinSeen();
              }
            : undefined
        }
        onSelect={(id) => {
          if (pinHint) {
            removePinNote();
            onPinSeen();
          }
          onSelect(Number(id));
        }}
        onZoom={(a, b) => setZoom({ from: a, to: b })}
        onPickMany={(ids) => onPickMany(ids.map(Number))}
      />
      {zoom && (
        <p className="meta tm-chart-note">
          이 기간을 확대했어요.{' '}
          <button type="button" className="btn-text" onClick={() => setZoom(null)}>
            전체 기간으로
          </button>
        </p>
      )}
    </div>
  );
}

/** 표로 보기: 월말 종가만(결정 ④, 일별 종가를 표로 내보내지 않는다). 그 달 마지막 거래일 값을 고르기만 한다. */
function MonthEndTable({ series }: { series: PriceSeries[] }) {
  const rows = useMemo(() => {
    const byMonth = new Map<string, Map<string, { date: string; close: number }>>();
    series.forEach((s) =>
      s.points.forEach((pt) => {
        const ym = pt.date.slice(0, 7);
        if (!byMonth.has(ym)) byMonth.set(ym, new Map());
        byMonth.get(ym)!.set(s.id, pt);
      }),
    );
    return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [series]);

  return (
    <section id="iiTable" className="tm-table-sec" aria-label="월말 종가 표">
      <div className="toolbar">
        <h3 className="tm-table-title">월말 종가</h3>
        <span className="spacer" />
        <span className="meta">그 달 마지막 거래일 종가 · 최근부터</span>
      </div>
      <div className="tm-table-wrap">
        <table className="tm-table">
          <thead>
            <tr>
              <th scope="col">월</th>
              {series.map((s) => (
                <th key={s.id} scope="col" className="r">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([ym, by]) => (
              <tr key={ym}>
                <td className="nw">{ym.replace('-', '.')}</td>
                {series.map((s) => {
                  const pt = by.get(s.id);
                  return (
                    <td key={s.id} className="r">
                      {pt ? `${won(pt.close)}원` : '—'}
                      {pt && <span className="sm">{pt.date.slice(5).replace('-', '.')}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 업종별 순위(왼쪽 패널 탭): 키움 업종명(upName) 단위로 시가총액 상위 종목. 테마 자동 분류가 아니다(결정 ⑦). 첫 업종만 펼쳐 둔다. */
function IndustryGroups({
  q,
  board,
  picked,
  onToggle,
}: {
  q: ReturnType<typeof useIndustries>;
  board: 'KOSPI' | 'KOSDAQ';
  picked: Instrument[];
  onToggle: (i: Instrument) => void;
}) {
  const full = picked.length >= MAX_PICKS;
  const d = q.data;
  return (
    <>
      <div className="tm-stocks-body ii-groups-body">
        {q.isPending && (
          <ul className="tm-list" aria-hidden="true">
            {Array.from({ length: 6 }, (_, k) => (
              <li key={k} className="skel tm-skel-row" />
            ))}
          </ul>
        )}
        {q.isError && (
          <div className="tm-list-state">
            <p className="meta">{errorText(q.error)}</p>
            <button type="button" className="btn btn-line btn-sm" onClick={() => q.refetch()}>
              다시 시도
            </button>
          </div>
        )}
        {d && d.items.length === 0 && <p className="tm-list-state meta">아직 업종을 모으지 않았어요. 시세 수집(worker)이 한 번 돌면 보여요.</p>}
        {d && d.items.length > 0 && (
          <ol className="ii-groups" aria-label={`${board === 'KOSPI' ? '코스피' : '코스닥'} 업종, 시가총액 합 순`}>
            {d.items.map((g, k) => (
              <li key={g.categoryCode}>
                <details className="ii-group" open={k === 0}>
                  <summary>
                    <span className="nm">{g.categoryName}</span>
                    <span className="meta num">
                      {g.totalMarketCap != null && `합 ${capText(g.totalMarketCap)} · `}
                      {g.instruments.length}개
                    </span>
                  </summary>
                  <ol className="ii-ind-list" aria-label={`${g.categoryName} 시가총액 순`}>
                    {g.instruments.map((i) => {
                      const on = picked.some((p) => p.id === i.id);
                      return (
                        <li key={i.id}>
                          <button type="button" aria-pressed={on} disabled={!on && full} onClick={() => onToggle(asInstrument(board, i))} title={on ? '차트에서 빼기' : '차트에 넣기'}>
                            <Avatar name={i.name} />
                            <span className="nm">{i.name}</span>
                            {on ? (
                              <span className="cap on">
                                <Icon id="i-check" size={14} />
                                차트
                              </span>
                            ) : (
                              <span className="meta num">{i.rank}위</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </details>
              </li>
            ))}
          </ol>
        )}
      </div>
      {d && d.items.length > 0 && (
        <p className="meta tm-stocks-foot">
          {d.isSample && <span className="tag-ex">예시</span>} 업종: {d.sources.map((s) => `${s.name}(${s.note})`).join(' · ')}
          {d.classificationAsOf && ` · ${d.classificationAsOf.replaceAll('-', '.')} 기준`}. 업종마다 상위 5개, 순위는 시장 전체 시가총액 순위예요.
          {d.note && <span className="tm-block">{d.note}</span>}
        </p>
      )}
    </>
  );
}

/** 첫 방문 안내(F5): 모달 1장. [차트 보기]가 과거 시세 고지(PRICE_PAST) 확인을 겸하고, 누르면 시가총액 1위·3개월 차트를 그린다. */
function IntroDialog({ onStart }: { onStart: (ack: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // 마지막 단계: 투자 성향을 아직 고르지 않았으면 [차트 보기] 뒤에 한 번 묻는다(investor-type 결정). 고르지 않고 넘어가도 된다
  const mine = useInvestorType();
  const [last, setLast] = useState<boolean | null>(null);
  const finish = (ack: boolean) => (mine ? onStart(ack) : setLast(ack));
  // close 이벤트로 상태를 바꾸지 않는다: 개발 모드(StrictMode)는 effect를 두 번 돌려 정리 단계의 close()가 열자마자 닫았다
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="introTitle"
      onCancel={(e) => {
        e.preventDefault(); // Esc: 고지 확인 없이 닫고 차트를 보여 준다(차트 아래에도 같은 고지가 있다)
        onStart(last ?? false);
      }}
    >
      {last != null ? (
        <div className="tm-dialog it-step">
          <div>
            <h2 id="introTitle" className="tm-dialog-title">
              마지막으로, 어떤 투자자에 가까워요?
            </h2>
            <p className="meta">고른 성향에 흔히 쓰이는 상품 유형을 [내 투자 성향]에서 볼 수 있어요. 언제든 바꿀 수 있어요.</p>
          </div>
          <TypeChoices
            compact
            onPick={(id) => {
              setInvestorType(id);
              onStart(last);
            }}
          />
          <div className="toolbar tm-dialog-acts">
            <button type="button" className="btn btn-line" onClick={() => onStart(last)}>
              나중에 고를게요
            </button>
          </div>
        </div>
      ) : (
        <form
          className="tm-dialog"
          onSubmit={(e) => {
            e.preventDefault();
            finish(true);
          }}
        >
          <div>
            <h2 id="introTitle" className="tm-dialog-title">
              시장과 종목의 지난 흐름을 봐요
            </h2>
            <p className="meta">시가총액 1위 종목의 지난 3개월 주가와, 그사이 크게 오르내린 때를 핀으로 먼저 보여 드릴게요.</p>
          </div>
          <div className="disclaimer">
            <Icon id="i-info" size={16} />
            <span>{PRICE_PAST}</span>
          </div>
          <div className="toolbar tm-dialog-acts">
            <button type="submit" className="btn btn-primary">
              차트 보기
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
