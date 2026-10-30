// 예금 비교(지금 가입하면): 조건 바 · 상품 표 · 고른 상품 비교 칸. 적금 비교(Savings.tsx)와 같은 구성이다.
// 적금과 다른 점: 매달 넣는 돈 대신 처음에 한 번 넣는 돈(amount)을 받고, 적립 방식 대신 단리·복리를 거른다. 정책 상품 탭은 없다.
// 순위·추천 문장·가입 버튼은 두지 않는다(팀장 확정 6). 금액은 모두 서버 결과를 그대로 그린다(ADR-3).
import { Fragment, useEffect, useState } from 'react';
import { useSession } from '@/auth/session';
import { LineLegend, MultiLineChart, seriesColor } from '@/charts/MultiLineChart';
import { Icon } from '@/components/Icons';
import { CompanyPicker, ErrorCard, Loading, Notice, ScrollTopButton } from '@/components/ProductCompareParts';
import {
  useDepositCompanies,
  useDepositProduct,
  useDepositProducts,
  useDepositSimulation,
  useDepositSimulations,
  type DepositProduct,
} from '@/data/deposit';
import { useSubscription } from '@/data/plans';
import type { InterestType, SavingsSort, SavingsTerm, Sector } from '@/data/savings';
import { errorText } from '@/lib/api';
import { won } from '@/lib/format';

const TERMS: SavingsTerm[] = [6, 12, 24, 36];
const SORTS: { s: SavingsSort; label: string }[] = [
  { s: 'BASE_RATE', label: '기본금리 높은 순' },
  { s: 'MAX_RATE', label: '최고금리 높은 순' },
  { s: 'TERM', label: '기간순' },
];
const INTEREST: { v: InterestType | null; label: string }[] = [
  { v: null, label: '전체' },
  { v: 'SIMPLE', label: '단리' },
  { v: 'COMPOUND', label: '복리' },
];
const PRESETS = [1_000_000, 5_000_000, 10_000_000];
const DEFAULT_AMOUNT = 10_000_000;
// TODO(BE): 비교 개수는 설정값(무료 2 / 플러스 5). GET /billing/plans의 limits로 바꾼다(적금과 같다)
const COMPARE_LIMIT = { FREE: 2, PLUS: 5 };
const SECTORS: Sector[] = ['BANK', 'SAVINGS_BANK'];
const ALL_SIZE = 1000; // 쪽 나누기 없이 전체를 한 번에 받는다
const NOUN = '예금';

const pct = (r: number) => r.toFixed(2) + '%';
const ym = (s: string) => {
  const [y, m] = s.split('-');
  return `${y}.${m}`;
};
const typeLabel = (t: InterestType) => (t === 'SIMPLE' ? '단리' : '월복리');
/** 1만 원 단위로 내림. 1만 원보다 작으면 null. */
const toTenThousand = (s: string) => {
  const n = Math.floor(Number(s) / 10_000) * 10_000;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const manWon = (n: number) => (n % 10_000 === 0 ? `${won(n / 10_000)}만 원` : `${won(n)}원`);

/** 표에서 상품 줄을 누르면 그 줄 아래에 펼쳐지는 상세. */
function ProductDetail({ p: row, term, amount }: { p: DepositProduct; term: SavingsTerm; amount: number }) {
  const detail = useDepositProduct(row.id, term, row.interestType);
  const max = useDepositSimulation({ productId: row.id, amount, termMonths: term, interestType: row.interestType, rateBasis: 'MAX' });
  const p = detail.data;
  return (
    <div className="sv-detail-body">
      {detail.isPending ? (
        <div className="skel" style={{ height: 200, marginTop: 12 }} />
      ) : detail.isError ? (
        <p className="sub">{errorText(detail.error)}</p>
      ) : (
        p && (
          <>
            <p className="meta">
              {p.company} · {p.sector === 'BANK' ? '은행' : '저축은행'} · {typeLabel(p.interestType)} · {ym(p.disclosureMonth)} 공시 기준
            </p>
            <div className="stats sv-rates">
              <div className="stat">
                <span className="lbl">기본금리</span>
                <p className="val num">{pct(p.baseRate)}</p>
              </div>
              <div className="stat">
                <span className="lbl">최고금리</span>
                <p className="val num">{pct(p.maxRate)}</p>
              </div>
            </div>
            {max.data && p.maxRate > p.baseRate && (
              <p className="meta" style={{ marginTop: 8 }}>
                우대조건을 모두 채우면 만기 세후 이자 <b className="num">{won(max.data.interestAfterTax)}원</b>
              </p>
            )}
            <h3 className="sec-title sv-h3">우대조건 원문</h3>
            <p className="sv-cond">{p.specialConditionText}</p>
            <p className="meta">우대조건은 계산에 넣지 않아요. 내 조건에 맞는지는 원문에서 확인해 주세요.</p>
            <div className="set-row">
              <span className="k">가입 대상</span>
              <span className="v">{p.joinMember}</span>
            </div>
            <div className="set-row">
              <span className="k">가입 제한</span>
              <span className="v">{p.joinDeny}</span>
            </div>
            <div className="set-row">
              <span className="k">가입 한도</span>
              <span className="v">{p.maxLimit == null ? '없음' : won(p.maxLimit) + '원'}</span>
            </div>
            <a href={p.disclosureUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, fontWeight: 600 }}>
              공시 원문 보기(금융상품한눈에) ↗
            </a>
          </>
        )
      )}
    </div>
  );
}

type Picked = { p: DepositProduct; slot: number }; // slot = 비교에 넣을 때 받은 색 칸. 다른 상품을 빼도 바뀌지 않는다

/** 기간 동안 내 돈: 고른 상품마다 넣은 돈 위에 쌓이는 세전 이자 선(기본금리). 표로 보기면 달마다 표. */
function MoneyOverTime({ picked, amount, term, asTable }: { picked: Picked[]; amount: number; term: SavingsTerm; asTable: boolean }) {
  const sims = useDepositSimulations(
    picked.map(({ p }) => ({ productId: p.id, amount, termMonths: term, interestType: p.interestType, rateBasis: 'BASE' as const })),
  );
  const failed = sims.find((q) => q.isError);
  const head = (
    <>
      <h3 className="sec-title sv-h3">기간 동안 내 돈</h3>
      <p className="meta">넣은 돈 위에 달마다 쌓이는 이자예요(세전, 기본금리). 중간에 해지하면 이 금리를 다 받지 못해요.</p>
    </>
  );
  if (failed)
    return (
      <>
        {head}
        <p className="sub">{errorText(failed.error)}</p>
      </>
    );
  if (sims.some((q) => !q.data))
    return (
      <>
        {head}
        <div className="skel" style={{ height: 260, marginTop: 12 }} />
      </>
    );
  const lines = picked.map(({ p, slot }, i) => ({ id: p.id, name: p.name, colorSlot: slot, data: sims[i].data!.series }));
  if (lines.some((l) => l.data.length === 0)) return null;
  const months = lines[0].data;
  const cash = '이자 없이 모아 둔 경우(0원)';
  return (
    <>
      {head}
      {asTable ? (
        <div className="table-wrap">
          <table>
            <caption>기간 동안 쌓인 이자(세전)</caption>
            <thead>
              <tr>
                <th>개월</th>
                <th className="r">넣은 돈</th>
                {lines.map((l) => (
                  <th key={l.id} className="r">
                    {l.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m.month}>
                  <td>{m.month}개월</td>
                  <td className="r">{won(m.principal)}원</td>
                  {lines.map((l) => (
                    <td key={l.id} className="r">
                      {won(l.data[i].interestPreTax)}원
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <LineLegend series={lines} baseline={cash} />
          <MultiLineChart
            series={lines.map((l) => ({ id: l.id, name: l.name, colorSlot: l.colorSlot, points: l.data.map((d) => ({ x: d.month, y: d.interestPreTax })) }))}
            baseline={{ name: cash, y: 0 }}
            xLabel={(x) => `${x}개월`}
            ariaLabel={`기간 동안 쌓인 이자 꺾은선 그래프, ${term}개월`}
            tooltip={(x) => (
              <>
                <div className="meta">
                  {x}개월째 · 넣은 돈 {won(months[x - 1].principal)}원
                </div>
                {lines.map((l) => (
                  <div key={l.id} className="t-row">
                    <span>
                      <i className="t-key" style={{ borderColor: seriesColor(l.colorSlot) }} />
                      {l.name}
                    </span>
                    <b className="num">+{won(l.data[x - 1].interestPreTax)}원</b>
                  </div>
                ))}
              </>
            )}
          />
          <p className="sr-only">{lines.map((l) => `${l.name}: ${term}개월 끝 세전 이자 ${won(l.data[l.data.length - 1].interestPreTax)}원`).join(', ')}</p>
        </>
      )}
    </>
  );
}

function CompareCard({ picked, amount, term, limit }: { picked: Picked[]; amount: number; term: SavingsTerm; limit: number }) {
  const [asTable, setAsTable] = useState(false);
  const rows = [
    ...picked.map(({ p, slot }) => ({
      key: p.id,
      name: p.name,
      sub: p.company,
      rate: p.baseRate,
      color: seriesColor(slot),
      r: p.result,
    })),
    // 이자 0% 통장: 넣은 돈 그대로라 이자는 0원(서버 비교선 CASH와 같은 뜻)
    { key: 'cash', name: '이자 없이 모아 둔 경우', sub: '연 0%', rate: 0, color: 'var(--baseline)', r: null },
  ];
  const top = Math.max(1, ...rows.map((x) => x.r?.interestAfterTax ?? 0));
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>고른 상품 비교</h2>
          <p className="meta">
            최대 {limit}개 + 이자 0% · {manWon(amount)} · {term}개월
          </p>
        </div>
        {picked.length > 0 && (
          <button className="btn btn-line btn-sm" aria-expanded={asTable} aria-controls="dpCmpTable" onClick={() => setAsTable((v) => !v)}>
            {asTable ? '그래프로 보기' : '표로 보기'}
          </button>
        )}
      </div>
      {picked.length === 0 ? (
        <p className="sub">표의 비교 칸을 체크하면 만기 세후 이자와 기간 동안 내 돈을 나란히 볼 수 있어요.</p>
      ) : asTable ? (
        <div className="table-wrap" id="dpCmpTable">
          <table>
            <caption>고른 상품 비교</caption>
            <thead>
              <tr>
                <th>상품</th>
                <th className="r">기본금리</th>
                <th className="r">세후 이자</th>
                <th className="r">만기에 받는 돈</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key}>
                  <td>{x.name}</td>
                  <td className="r">{pct(x.rate)}</td>
                  <td className="r">{won(x.r?.interestAfterTax ?? 0)}원</td>
                  <td className="r">{x.r ? won(x.r.maturityAmount) + '원' : '넣은 돈 그대로'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <p className="field-label" style={{ marginBottom: 8 }}>
            만기에 받는 세후 이자(기본금리 기준)
          </p>
          <div className="sv-bars">
            {rows.map((x) => {
              const v = x.r?.interestAfterTax ?? 0;
              return (
                <div key={x.key} className="sv-bar">
                  <div className="sv-bar-name">
                    <p>{x.name}</p>
                    <p className="meta">{x.sub}</p>
                  </div>
                  <div className="sv-bar-track">
                    <span style={{ width: `${Math.max(1, (v / top) * 55)}%`, background: x.color }} />
                    <b className="num">{won(v)}원</b>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {picked.length > 0 && <MoneyOverTime picked={picked} amount={amount} term={term} asTable={asTable} />}
    </div>
  );
}

function NowMode({ compareLimit }: { compareLimit: number }) {
  const [preset, setPreset] = useState<number | 'manual'>(DEFAULT_AMOUNT);
  const [draft, setDraft] = useState(String(DEFAULT_AMOUNT));
  const [term, setTerm] = useState<SavingsTerm>(12);
  const [interestType, setInterestType] = useState<InterestType | null>(null);
  const [sort, setSort] = useState<SavingsSort>('BASE_RATE');
  const [companyNames, setCompanyNames] = useState<string[]>([]); // 비어 있으면 전체
  const [cmp, setCmp] = useState<Picked[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lockMsg, setLockMsg] = useState('');

  const companies = useDepositCompanies();
  const amount = preset === 'manual' ? (toTenThousand(draft) ?? 0) : preset;
  const list = useDepositProducts(
    {
      amount,
      termMonths: term,
      sort,
      direction: sort === 'TERM' ? 'ASC' : 'DESC',
      interestType,
      sectors: SECTORS,
      companies: companyNames,
      page: 1,
      size: ALL_SIZE,
    },
    amount > 0,
  );
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  // 계산 조건이 바뀌면 비교 목록을 비운다(이전 조건으로 계산한 값이라서)
  const companyKey = companyNames.join('|');
  useEffect(() => setCmp([]), [amount, term, interestType, companyKey]);

  const toggleCompare = (p: DepositProduct, on: boolean) => {
    setLockMsg('');
    if (!on) return setCmp((c) => c.filter((x) => x.p.id !== p.id));
    if (cmp.length >= compareLimit) {
      setLockMsg(`비교는 무료 ${COMPARE_LIMIT.FREE}개 · 플러스 ${COMPARE_LIMIT.PLUS}개까지예요`);
      return;
    }
    setCmp((c) => {
      let slot = 0;
      while (c.some((x) => x.slot === slot)) slot++; // 비어 있는 가장 앞 칸. 남은 상품의 색은 그대로 둔다
      return [...c, { p, slot }];
    });
  };
  const toggleOpen = (id: string) => setOpenId(openId === id ? null : id);
  const reset = () => {
    setPreset(DEFAULT_AMOUNT);
    setDraft(String(DEFAULT_AMOUNT));
  };

  return (
    <div className="col">
      <form className="card sv-cond-bar" aria-label="조건" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <span className="field-label">
            얼마를 맡길까요? <span className="tag-ex">예시</span>
          </span>
          <div className="toolbar" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <div className="seg" role="group" aria-label="맡길 돈">
              {PRESETS.map((v) => (
                <button key={v} type="button" aria-pressed={preset === v} onClick={() => setPreset(v)}>
                  {manWon(v)}
                </button>
              ))}
              <button type="button" aria-pressed={preset === 'manual'} onClick={() => setPreset('manual')}>
                직접 입력
              </button>
            </div>
            {preset === 'manual' && (
              <input
                className="input sv-amt"
                type="number"
                min={10000}
                step={10000}
                inputMode="numeric"
                aria-label="맡길 돈(원, 1만 원 단위)"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </div>
        </div>
        <div className="field">
          <span className="field-label">기간</span>
          <div className="seg" role="group" aria-label="기간">
            {TERMS.map((t) => (
              <button key={t} type="button" aria-pressed={term === t} onClick={() => setTerm(t)}>
                {t}개월
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">이자 방식</span>
          <div className="seg" role="group" aria-label="이자 방식">
            {INTEREST.map((o) => (
              <button key={o.label} type="button" aria-pressed={interestType === o.v} onClick={() => setInterestType(o.v)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">은행</span>
          <CompanyPicker companies={companies.data ?? []} value={companyNames} onChange={setCompanyNames} />
        </div>
      </form>

      <p className="meta">우대조건은 상품 상세에서 원문을 확인하세요. 계산에 넣지 않아요.</p>
      <div className="sv-main">
        <div className="col">
          {amount <= 0 ? (
            <div className="empty-box">
              <h3>맡길 돈을 입력해 주세요</h3>
              <p className="sub">1만 원 이상 입력하면 같은 조건으로 예금 상품을 비교할 수 있어요.</p>
            </div>
          ) : list.isPending ? (
            <Loading h={320} />
          ) : list.isError ? (
            <ErrorCard noun={NOUN} error={list.error} onRetry={() => list.refetch()} onReset={reset} />
          ) : total === 0 ? (
            <div className="empty-box">
              <h3>이 조건으로 계산할 상품이 없어요</h3>
              <p className="sub">기간이나 이자 방식, 은행을 바꿔 보세요.</p>
            </div>
          ) : (
            <>
              <div className="card">
                <p className="story">
                  같은 조건으로 계산한 상품 {total}개예요. 만기 세후 이자는 {won(list.data.minInterestAfterTax ?? 0)}원~
                  {won(list.data.maxInterestAfterTax ?? 0)}원이에요. {list.data.isSample && <span className="tag-ex">예시</span>}
                </p>
                <div className="toolbar" style={{ margin: '16px 0 4px' }}>
                  <label className="field sv-sort">
                    <span className="field-label">정렬</span>
                    <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SavingsSort)}>
                      {SORTS.map((o) => (
                        <option key={o.s} value={o.s}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="spacer" />
                  <span className="meta">
                    {ym(list.data.disclosureMonth)} 공시 기준 · 광고로 순서를 바꾸지 않아요
                    {list.data.noRateCount > 0 && ` · 금리 정보 없음 ${list.data.noRateCount}개`}
                  </span>
                </div>
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">예금 상품 목록</caption>
                    <thead>
                      <tr>
                        <th>상품·은행</th>
                        <th className="r">기본금리</th>
                        <th className="r">최고금리</th>
                        <th className="r">만기 세후 수령액(기본금리)</th>
                        <th>비교</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((p) => (
                        <Fragment key={p.id}>
                          <tr className={'sv-row' + (openId === p.id ? ' sel' : '')} onClick={() => toggleOpen(p.id)}>
                            <td>
                              <button type="button" className="btn-text sv-name" aria-expanded={openId === p.id} onClick={() => toggleOpen(p.id)}>
                                {p.name}
                              </button>
                              <div className="meta">
                                {p.company} {p.sector === 'SAVINGS_BANK' && <span className="tag">저축은행</span>} <span className="tag">{typeLabel(p.interestType)}</span>
                              </div>
                            </td>
                            <td className="r">{pct(p.baseRate)}</td>
                            <td className="r">{pct(p.maxRate)}</td>
                            <td className="r">
                              <div>{won(p.result.maturityAmount)}원</div>
                              <div className="meta">이자 {won(p.result.interestAfterTax)}원</div>
                              {p.result.excludedAmount > 0 && <div className="meta">한도 초과 {won(p.result.excludedAmount)}원은 넣지 못함</div>}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="sv-cmp"
                                aria-label={`${p.name} 비교에 넣기`}
                                checked={cmp.some((x) => x.p.id === p.id)}
                                onChange={(e) => toggleCompare(p, e.target.checked)}
                              />
                            </td>
                          </tr>
                          {openId === p.id && (
                            <tr className="sv-detail">
                              <td colSpan={5}>
                                <ProductDetail p={p} term={term} amount={amount} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                {lockMsg && (
                  <p className="locked-row" role="status">
                    <span>
                      <Icon id="i-lock" /> {lockMsg}
                    </span>
                  </p>
                )}
              </div>
              <Notice text={list.data.notice} />
            </>
          )}
        </div>

        <div className="sv-rail">
          {cmp.length >= 2 ? (
            <CompareCard picked={cmp} amount={amount} term={term} limit={compareLimit} />
          ) : (
            <div className="card">
              <h2>고른 상품 비교</h2>
              <p className="sub" style={{ marginTop: 8 }}>
                표의 비교 칸을 2개 이상 체크하면 만기 세후 이자를 여기에서 나란히 볼 수 있어요. 화면을 내려도 따라와요.
              </p>
            </div>
          )}
        </div>
      </div>
      <ScrollTopButton />
    </div>
  );
}

export default function Deposit() {
  const { status } = useSession();
  const sub = useSubscription(status === 'member');
  const compareLimit = status === 'guest' || sub.data?.plan === 'PLUS' ? COMPARE_LIMIT.PLUS : COMPARE_LIMIT.FREE;

  return (
    <section>
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">예금 비교</h1>
            <p className="page-desc">같은 돈을 지금 예금에 맡기면 만기에 얼마를 받는지, 기본금리·최고금리·기간으로 정렬해요.</p>
          </div>
        </div>
        <NowMode compareLimit={compareLimit} />
      </div>
    </section>
  );
}
