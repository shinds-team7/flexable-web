// 내 투자 성향(/type, /type/:id). 사용자가 성향을 직접 고르면 패시브(지수 ETF) : 액티브(고른 종목) 비율과,
// 그 성향이 흔히 고르는 상품 유형·그 유형의 실제 상품(시세 API), 어느 계좌에 담는지를 보여 준다. 기획: docs/product/proposal-investor-type.md
// 비율별 지난 3년 결과·계좌 예시는 고정 예시 값이고(ADR-3), 상품 목록만 시세 API를 그대로 쓴다. 예·적금은 이 화면에서 다루지 않는다.
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { LineLegend, MultiLineChart, seriesColor } from '@/charts/MultiLineChart';
import { LinkCards, Notice, PRODUCT_CARD, ProtoNote, SIM_PAST, type LinkCardItem } from '@/components/Proto';
import {
  ACCOUNTS,
  CMA_TYPES,
  EMERGENCY_STEPS,
  INVESTED,
  INVESTOR_TYPES,
  KINDS,
  PLAN_STAGES,
  RATIOS,
  ROLLING,
  findType,
  monthLabel,
  ratioOf,
  setInvestorType,
  useInvestorType,
  type InvestorType,
  type InvestorTypeId,
  type ProductKind,
} from '@/data/investorType';
import { useBoard } from '@/data/market';
import { arrow, pctTxt, upDown, won } from '@/lib/format';

export const TYPE_LIST =
  '고른 성향에 흔히 쓰이는 상품 유형과, 그 유형에 속한 상품을 정해진 기준으로 나열했어요. 특정 상품을 사라는 뜻이 아니에요. 투자 상품은 원금을 잃을 수 있고, 실제 조건은 금융사에서 꼭 확인해 주세요.';

/** 투자 시뮬레이션(사건 퀴즈, #88) 경로. null이면 카드를 숨긴다(없는 기능 암시 금지) */
const SIMULATION_PATH: string | null = '/simulation';

const man = (n: number) => `${won(n / 10000)}만 원`;

function Rate({ r }: { r: number }) {
  return (
    <span className={upDown(r)}>
      {arrow(r)} {pctTxt(r)}
    </span>
  );
}

const ratioName = (active: number) => (active === 0 ? '패시브만' : active === 100 ? '액티브만' : INVESTOR_TYPES.find((t) => t.active === active)?.name ?? `${100 - active} : ${active}`);

export function MixBar({ t }: { t: InvestorType }) {
  const parts = [
    { label: '패시브 · 지수 ETF', pct: 100 - t.active },
    { label: '액티브 · 고른 종목', pct: t.active },
  ];
  return (
    <div className="it-mix" role="img" aria-label={parts.map((m) => `${m.label} ${m.pct}%`).join(', ')}>
      {parts.map((m, i) => (
        <span key={m.label} className={'it-mix-part p' + i} style={{ flexGrow: m.pct }}>
          {m.label} {m.pct}
        </span>
      ))}
    </div>
  );
}

/** 성향 아이콘(선 아이콘, 글자색을 따른다): 안정형 방패 · 균형형 저울 · 성장형 오르는 선 */
function TypeIcon({ id }: { id: InvestorTypeId }) {
  return (
    <svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {id === 'stable' ? (
        <>
          <path d="M24 5 9 11v11c0 10 6.4 17.6 15 21 8.6-3.4 15-11 15-21V11L24 5Z" />
          <path d="m17 24 5 5 9-10" />
        </>
      ) : id === 'balanced' ? (
        <>
          <path d="M24 7v34M14 41h20M10 13h28" />
          <path d="m10 13-6 13a6 6 0 0 0 12 0l-6-13ZM38 13l-6 13a6 6 0 0 0 12 0l-6-13Z" />
        </>
      ) : (
        <>
          <path d="M6 40h36" />
          <path d="m8 32 10-10 7 6 15-16" />
          <path d="M31 12h9v9" />
        </>
      )}
    </svg>
  );
}

/** 세 성향 카드. 첫 방문 안내 마지막 단계에서도 쓴다(compact: 아이콘 없이 짧게) */
export function TypeChoices({ onPick, compact = false }: { onPick: (id: InvestorTypeId) => void; compact?: boolean }) {
  const mine = useInvestorType();
  return (
    <div className={'it-cards' + (compact ? ' compact' : '')}>
      {INVESTOR_TYPES.map((t) => (
        <button key={t.id} type="button" className={'card it-card' + (mine === t.id ? ' on' : '')} aria-pressed={mine === t.id} onClick={() => onPick(t.id)}>
          {!compact && (
            <span className="it-icon">
              <TypeIcon id={t.id} />
            </span>
          )}
          <span className="it-name">
            {t.name}
            {mine === t.id && <span className="tag">지금 내 성향</span>}
          </span>
          <b className="it-one">{t.oneLine}</b>
          {!compact && (
            <ul className="it-traits">
              {t.traits.map((x) => (
                <li key={x.k}>
                  <span className="meta">{x.k}</span> {x.v}
                </li>
              ))}
            </ul>
          )}
          <MixBar t={t} />
        </button>
      ))}
    </div>
  );
}

export function InvestorTypes() {
  const nav = useNavigate();
  return (
    <section className="page col">
      <ProtoNote />
      <div className="page-head">
        <h1 className="page-title">나는 어떤 투자자에 가까울까요?</h1>
        <p className="page-desc">성향은 시장 전체에 꾸준히 넣는 패시브와, 직접 골라 넣는 액티브를 어떤 비율로 섞는지로 나눴어요. 직접 골라 주세요. 언제든 바꿀 수 있어요.</p>
      </div>
      <TypeChoices
        onPick={(id) => {
          setInvestorType(id);
          nav(`/type/${id}`);
        }}
      />
      <Notice text={TYPE_LIST} />
    </section>
  );
}

export function InvestorTypeDetail() {
  const { id } = useParams();
  const t = findType(id);
  const mine = useInvestorType();
  if (!t) return <Navigate to="/type" replace />;

  const more: LinkCardItem[] = [
    { to: '/invest', title: '투자 인사이트', desc: '시장 흐름과 종목의 지난 주가를 보고, 그때 무슨 일이 있었는지 사건으로 짚어 봐요.' },
    { to: '/diversify', title: '분산 투자', desc: '가진 종목이 어느 업종·자산에 몰려 있는지, 같이 덜 움직인 쪽은 어디인지 봐요.' },
    ...(SIMULATION_PATH ? [{ to: SIMULATION_PATH, title: '투자 시뮬레이션', desc: '시간이 흐르며 생기는 사건마다 직접 판단하고, 내 돈이 어떻게 바뀌는지 봐요.' }] : []),
  ];

  return (
    <section className="page col">
      <ProtoNote />
      <div className="it-head">
        <div className="seg" role="group" aria-label="성향 바꿔 보기">
          {INVESTOR_TYPES.map((x) => (
            <Link key={x.id} to={`/type/${x.id}`} role="button" aria-pressed={x.id === t.id} className="it-seg">
              {x.name}
            </Link>
          ))}
        </div>
        <h1 className="page-title">
          {t.name} · {t.oneLine}
        </h1>
        <div className="toolbar">
          {mine === t.id ? (
            <span className="tag">지금 내 성향</span>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setInvestorType(t.id)}>
              내 성향으로 정하기
            </button>
          )}
          <Link className="btn-text" to="/type">
            세 성향 다시 보기
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>이런 성향이면</h2>
          <span className="tag-ex">예시</span>
        </div>
        <div className="it-grid">
          <div>
            <ul className="it-traits">
              {t.traits.map((x) => (
                <li key={x.k}>
                  <span className="meta">{x.k}</span> {x.v}
                </li>
              ))}
            </ul>
            <ul className="it-ways">
              {t.ways.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="sub" style={{ margin: '0 0 8px' }}>
              흔히 알려진 나눠 넣기
            </p>
            <MixBar t={t} />
            <p className="meta" style={{ marginTop: 8 }}>
              패시브는 시장 전체(지수)를 정해진 금액으로 꾸준히, 액티브는 종목을 직접 골라 넣는 방식이에요.
            </p>
          </div>
        </div>
      </div>

      <PastCard t={t} />

      <div className="it-sec">
        <h2 className="it-h2">{t.name} 투자자들이 흔히 고르는 상품 유형</h2>
        <p className="page-desc">유형마다 실제 상품을 정해진 기준으로 나열했어요. 기준은 카드마다 적어 뒀어요.</p>
      </div>
      <div className="it-products">
        {t.kinds.map((k) => (
          <KindCard key={k} kind={k} />
        ))}
      </div>
      <Notice text={TYPE_LIST} />

      <AccountsSection t={t} />

      <div className="it-sec">
        <h2 className="it-h2">더 알아보기</h2>
      </div>
      <LinkCards items={more} />
    </section>
  );
}

/** 이 비율로 지난 3년(반반 실험·지수 시뮬레이션 내용) */
function PastCard({ t }: { t: InvestorType }) {
  const r = ratioOf(t.active);
  const lines = [
    { id: 'mine', name: `${t.name}(${100 - t.active}:${t.active})`, colorSlot: 0, data: r.series },
    { id: 'passive', name: '패시브만', colorSlot: 1, data: ratioOf(0).series },
    { id: 'active', name: '액티브만', colorSlot: 2, data: ratioOf(100).series },
    { id: 'invested', name: '넣은 돈', colorSlot: 3, data: INVESTED },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <h2>이 비율로 3년 전부터 매달 78,000원 넣었다면</h2>
        <span className="tag-ex">예시</span>
      </div>
      <div className="stats pv-stats">
        <div className="stat">
          <span className="lbl">넣은 돈</span>
          <p className="val num">{won(INVESTED[INVESTED.length - 1])}원</p>
        </div>
        <div className="stat tm-stat-main">
          <span className="lbl">지금 평가액</span>
          <p className="val num">{won(r.value)}원</p>
          <span className="dl">
            <Rate r={r.rate} />
          </span>
        </div>
        <div className="stat">
          <span className="lbl">가장 많이 줄어 있던 때</span>
          <p className="val num">
            <Rate r={r.worstRate} />
          </p>
          <span className="meta">{r.worstAt}</span>
        </div>
        <div className="stat">
          <span className="lbl">원금으로 돌아오기까지</span>
          <p className="val num">{r.recoverMonths}개월</p>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <LineLegend series={lines} />
        <MultiLineChart
          series={lines.map((l) => ({ id: l.id, name: l.name, colorSlot: l.colorSlot, points: l.data.map((y, x) => ({ x, y })) }))}
          xLabel={monthLabel}
          ariaLabel={`${t.name} 비율, 패시브만, 액티브만으로 매달 넣었을 때 평가액과 넣은 돈 꺾은선 그래프, 36개월`}
          tooltip={(x) => (
            <>
              <div className="meta">{monthLabel(x)}</div>
              {lines.map((l) => (
                <div key={l.id} className="t-row">
                  <span>
                    <i className="t-key" style={{ borderColor: seriesColor(l.colorSlot) }} />
                    {l.name}
                  </span>
                  <b className="num">{won(l.data[x])}원</b>
                </div>
              ))}
            </>
          )}
        />
      </div>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <caption className="meta">비율마다 이렇게 달랐어요 · 넣은 돈 2,808,000원</caption>
          <thead>
            <tr>
              <th>패시브 : 액티브</th>
              <th className="r">지금 평가액</th>
              <th className="r">가장 많이 줄어 있던 때</th>
              <th className="r">원금으로 돌아오기까지</th>
            </tr>
          </thead>
          <tbody>
            {RATIOS.map((x) => (
              <tr key={x.active} className={x.active === t.active ? 'it-on' : ''}>
                <td>
                  <b>{ratioName(x.active)}</b> <span className="meta">{100 - x.active} : {x.active}</span>
                </td>
                <td className="r num">
                  {won(x.value)}원 <Rate r={x.rate} />
                </td>
                <td className="r num">
                  <Rate r={x.worstRate} /> <span className="meta">{x.worstAt}</span>
                </td>
                <td className="r num">{x.recoverMonths}개월</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="it-more">
        <summary>패시브 몫은 언제 시작했느냐에 따라 달라요(시작한 달별 3년 결과)</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시작한 달</th>
                <th className="r">3년 뒤</th>
                <th className="r">가장 많이 줄어 있던 때</th>
              </tr>
            </thead>
            <tbody>
              {ROLLING.map((x) => (
                <tr key={x.start}>
                  <td>{x.start}</td>
                  <td className="r num">
                    <Rate r={x.rate} />
                  </td>
                  <td className="r num">
                    <Rate r={x.worstRate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <Notice text={SIM_PAST} />
    </div>
  );
}

/** 어디에 담을까(계좌 설계·계좌 알아보기 내용) */
function AccountsSection({ t }: { t: InvestorType }) {
  const [stageId, setStageId] = useState(PLAN_STAGES[0].id);
  const st = PLAN_STAGES.find((s) => s.id === stageId) ?? PLAN_STAGES[0];
  const top = Math.max(...st.accounts.map((a) => a.monthly));
  return (
    <>
      <div className="it-sec">
        <h2 className="it-h2">어느 계좌에 담을까</h2>
        <p className="page-desc">
          계좌는 상품을 담는 그릇이에요. 연금 계좌에는 종목을 담을 수 없어서, {t.name}의 패시브 몫({100 - t.active}%)은 연금 계좌와 ISA에, 액티브 몫({t.active}%)은 ISA에 담는 방식이 많이 알려져 있어요.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            월급 {man(st.salary)} 중 {man(st.saving)}을 모을 때
          </h2>
          <div className="seg" role="group" aria-label="단계">
            {PLAN_STAGES.map((s) => (
              <button key={s.id} type="button" aria-pressed={s.id === stageId} onClick={() => setStageId(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flow">
          <div className="flow-node">
            <span className="lbl">월급날</span>
            <b>은행 통장</b>
            <p className="meta">월급을 받고 카드값·자동이체가 빠져요.</p>
          </div>
          <span className="flow-arrow" aria-hidden="true">
            →
          </span>
          <div className="flow-node">
            <span className="lbl">다음 날</span>
            <b>CMA</b>
            <p className="meta">남은 돈을 옮겨 두면 하루 단위로 이자를 받으며 투자를 기다려요.</p>
          </div>
          <span className="flow-arrow" aria-hidden="true">
            →
          </span>
          <div className="flow-node">
            <span className="lbl">담는 계좌</span>
            <ul className="flow-accts">
              {st.accounts.map((a) => (
                <li key={a.name}>
                  <div className="row-between">
                    <b>{a.name}</b>
                    <b className="num">월 {man(a.monthly)}</b>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <i style={{ width: `${Math.round((a.monthly / top) * 100)}%` }} />
                  </div>
                  <span className="meta">{a.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="it-tax">
          <span className="meta">연말정산 때 돌려받는 돈</span>
          <b className="num">{won(st.taxBack)}원</b>
          <span className="meta">{st.taxBasis}</span>
          <span className="tag-ex">예시</span>
        </div>
        <ul className="plan-notes">
          {st.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>계좌 나란히 보기</h2>
          <span className="tag-ex">2026-10 확인 전</span>
        </div>
        <div className="table-wrap">
          <table className="acct-table">
            <thead>
              <tr>
                <th>계좌</th>
                <th>쓰임</th>
                <th>담을 수 있는 것</th>
                <th>한도</th>
                <th>세금</th>
                <th>급할 때 꺼내기</th>
                <th>여는 곳</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNTS.map((a) => (
                <tr key={a.name}>
                  <th scope="row">{a.name}</th>
                  <td>{a.use}</td>
                  <td>{a.holds}</td>
                  <td>{a.limit}</td>
                  <td>{a.tax}</td>
                  <td>{a.withdraw}</td>
                  <td>{a.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="it-products">
        <div className="card">
          <div className="card-head">
            <h2>CMA 종류</h2>
          </div>
          <div className="cma-types">
            {CMA_TYPES.map((c) => (
              <div key={c.name} className="card-sunken">
                <b>{c.name}</b>
                <span>{c.what}</span>
                <span className="meta">{c.note}</span>
              </div>
            ))}
          </div>
          <p className="meta" style={{ marginTop: 12 }}>
            CMA는 예금자보호 대상이 아니에요(종금형 제외).
          </p>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>급할 때 꺼내는 순서</h2>
          </div>
          <ol className="steps">
            {EMERGENCY_STEPS.map((s) => (
              <li key={s.title}>
                <b>{s.title}</b>
                <span className="meta">{s.desc}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <Notice text={PRODUCT_CARD} />
    </>
  );
}

function KindCard({ kind }: { kind: ProductKind }) {
  const k = KINDS[kind];
  const q = useBoard(kind === 'kospi' ? 'KOSPI' : kind === 'kosdaq' ? 'KOSDAQ' : 'ETF');
  const d = q.data;
  const items = (d?.items ?? []).filter((i) => (!k.match || k.match.test(i.name)) && !k.skip?.test(i.name)).slice(0, 4);
  const state = q.isPending ? '불러오는 중이에요' : q.isError ? '목록을 불러오지 못했어요' : items.length === 0 ? '아직 이 유형의 시세를 모으지 않았어요' : null;
  return (
    <div className="card it-kind">
      <div className="card-head">
        <h3>{k.title}</h3>
        <span className="tag">{k.side}</span>
      </div>
      <p className="sub">{k.desc}</p>
      <p className="meta it-basis">
        {k.basis}
        {d?.dataAsOf && ` · ${d.dataAsOf} 기준`}
      </p>
      {state ? (
        <p className="meta">{state}</p>
      ) : (
        <ol className="it-rows">
          {items.map((i) => (
            <li key={i.id}>
              <b>{i.name}</b>
              <span className="meta">{i.id}</span>
            </li>
          ))}
        </ol>
      )}
      <Link className="btn-text" to="/invest">
        투자 인사이트에서 지난 기록 보기 →
      </Link>
    </div>
  );
}
