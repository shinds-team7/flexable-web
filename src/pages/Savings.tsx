// 적금 비교: [지금 가입하면] 조건 300px · 상품 표 · 고른 상품 상세 360px / [그때 들었다면] 은행 평균 적금 한 줄 / [정책 적금] 조건 직접 입력.
// 설계는 project2 docs/web/01-product.md F2, 02-design.md §5-5. 순위·추천 문장·가입 버튼은 두지 않는다(팀장 확정 6).
// 금액은 모두 서버 결과를 그대로 그린다(ADR-3). 막대 길이처럼 그리기 위한 비율만 화면에서 정한다.
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { Icon } from '@/components/Icons';
import { useSeedMoney } from '@/data/home';
import { useSubscription } from '@/data/plans';
import {
  useAverageSavings,
  usePolicySavings,
  usePolicySimulation,
  useSavingsProduct,
  useSavingsProducts,
  useSavingsSimulation,
  type PolicySavingsRules,
  type PolicySimulateRequest,
  type PolicyType,
  type ReserveType,
  type SavingsProduct,
  type SavingsSort,
  type SavingsTerm,
  type Sector,
} from '@/data/savings';
import { ApiError, errorText } from '@/lib/api';
import { won } from '@/lib/format';

type Mode = 'now' | 'past' | 'policy';
const MODES: { m: Mode; label: string }[] = [
  { m: 'now', label: '지금 가입하면' },
  { m: 'past', label: '그때 들었다면' },
  { m: 'policy', label: '정책 적금' },
];
const TERMS: SavingsTerm[] = [6, 12, 24, 36];
const SORTS: { s: SavingsSort; label: string }[] = [
  { s: 'BASE_RATE', label: '기본금리 높은 순' },
  { s: 'MAX_RATE', label: '최고금리 높은 순' },
  { s: 'TERM', label: '기간순' },
];
// TODO(BE): 비교 개수는 설정값(무료 2 / 플러스 5). GET /billing/plans의 limits로 바꾼다
const COMPARE_LIMIT = { FREE: 2, PLUS: 5 };
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
const POLICY_CODE = 'YOUTH_FUTURE';
const FALLBACK_PACE = 78000; // 비로그인 체험 기본(03 §8-2)

const pct = (r: number) => r.toFixed(2) + '%';
const ym = (s: string) => {
  const [y, m] = s.split('-');
  return `${y}.${m}`;
};
const toThousand = (s: string) => {
  const n = Math.floor(Number(s) / 1000) * 1000;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function Notice({ text }: { text: string }) {
  return (
    <p className="disclaimer">
      <Icon id="i-info" size={14} />
      {text}
    </p>
  );
}

function Assumptions({ items }: { items: string[] }) {
  return (
    <ul className="sv-assume">
      {items.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
}

function Loading({ h = 240 }: { h?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="불러오는 중">
      <div className="skel" style={{ height: 18, width: 200 }} />
      <div className="skel" style={{ height: h, marginTop: 16 }} />
    </div>
  );
}

/** 예시 데이터에 없는 조건(SAMPLE_ONLY)이면 기본 조건으로 돌아가는 버튼을 준다. */
function ErrorCard({ error, onRetry, onReset }: { error: unknown; onRetry: () => void; onReset?: () => void }) {
  const sampleOnly = error instanceof ApiError && error.code === 'SAMPLE_ONLY';
  return (
    <div className="error-box" role="alert">
      <h3>{sampleOnly ? '이 조건은 아직 계산할 수 없어요' : '적금 정보를 불러오지 못했어요'}</h3>
      <p className="sub">{errorText(error)}</p>
      <div className="toolbar">
        {sampleOnly && onReset ? (
          <button className="btn btn-primary" onClick={onReset}>
            기본 조건으로
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onRetry}>
            다시 불러오기
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── 지금 가입하면 ───────── */

function ProductDetail({ id, term, monthly, onClose }: { id: string | null; term: SavingsTerm; monthly: number; onClose: () => void }) {
  const detail = useSavingsProduct(id, term);
  const max = useSavingsSimulation(id ? { productId: id, monthly, termMonths: term, rateBasis: 'MAX' } : null);
  const p = detail.data;
  return (
    <div className="card rail">
      <div className="card-head" style={{ marginBottom: 4 }}>
        <h2>{p ? p.name : '고른 상품 상세'}</h2>
        <button className="btn btn-line btn-sm rail-close" onClick={onClose}>
          닫기
        </button>
      </div>
      {!id ? (
        <p className="sub">표에서 상품 이름을 눌러 보세요.</p>
      ) : detail.isPending ? (
        <div className="skel" style={{ height: 200, marginTop: 12 }} />
      ) : detail.isError ? (
        <p className="sub">{errorText(detail.error)}</p>
      ) : (
        p && (
          <>
            <p className="meta">
              {p.company} · {p.sector === 'BANK' ? '은행' : '저축은행'} · {ym(p.disclosureMonth)} 공시 기준 <span className="tag-ex">예시</span>
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
              <span className="k">월 한도</span>
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

function CompareCard({ items, monthly, term, limit }: { items: SavingsProduct[]; monthly: number; term: SavingsTerm; limit: number }) {
  const [asTable, setAsTable] = useState(false);
  const rows = [
    ...items.map((p, i) => ({ key: p.id, name: p.name, sub: p.company, rate: p.baseRate, color: SERIES[i], r: p.result })),
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
            최대 {limit}개 + 이자 0% · 매달 {won(monthly)}원 · {term}개월
          </p>
        </div>
        {items.length > 0 && (
          <button className="btn btn-line btn-sm" aria-expanded={asTable} aria-controls="svCmpTable" onClick={() => setAsTable((v) => !v)}>
            {asTable ? '막대로 보기' : '표로 보기'}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="sub">표의 비교 칸을 체크하면 만기 세후 이자를 나란히 볼 수 있어요.</p>
      ) : asTable ? (
        <div className="table-wrap" id="svCmpTable">
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
                    <span style={{ width: `${Math.max(1, (v / top) * 80)}%`, background: x.color }} />
                    <b className="num">{won(v)}원</b>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function NowMode({ pace, compareLimit }: { pace: number; compareLimit: number }) {
  const [amountMode, setAmountMode] = useState<'pace' | 'manual'>('pace');
  const [draft, setDraft] = useState(String(pace));
  const [term, setTerm] = useState<SavingsTerm>(12);
  const [reserveType, setReserveType] = useState<ReserveType>('FIXED');
  const [sectors, setSectors] = useState<Sector[]>(['BANK', 'SAVINGS_BANK']);
  const [sort, setSort] = useState<SavingsSort>('BASE_RATE');
  const [cmp, setCmp] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [condOpen, setCondOpen] = useState(false);
  const [lockMsg, setLockMsg] = useState('');

  const monthly = amountMode === 'pace' ? pace : (toThousand(draft) ?? pace);
  const list = useSavingsProducts({ monthly, termMonths: term, sort, direction: sort === 'TERM' ? 'ASC' : 'DESC', reserveType, sectors });
  const items = list.data?.items ?? [];
  const picked = cmp.map((id) => items.find((p) => p.id === id)).filter((p): p is SavingsProduct => !!p);
  const afterTax = items.map((p) => p.result.interestAfterTax);

  const toggleSector = (s: Sector) => setSectors((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const toggleCompare = (id: string, on: boolean) => {
    setLockMsg('');
    if (!on) return setCmp((c) => c.filter((x) => x !== id));
    if (picked.length >= compareLimit) {
      setLockMsg(`비교는 무료 ${COMPARE_LIMIT.FREE}개 · 플러스 ${COMPARE_LIMIT.PLUS}개까지예요`);
      return;
    }
    setCmp((c) => [...c.filter((x) => items.some((p) => p.id === x)), id]);
  };
  const open = (id: string) => {
    setOpenId(id);
    setRailOpen(true);
  };
  const reset = () => {
    setAmountMode('pace');
    setDraft(String(pace));
  };

  return (
    <div className="sim">
      <aside className={'cond-col col' + (condOpen ? ' expanded' : '')} aria-label="조건">
        <div className="card cond-summary sv-cond-summary">
          <span className="sub">
            매달 {won(monthly)}원 · {term}개월 · {reserveType === 'FIXED' ? '정액' : '자유'}
          </span>
          <button className="btn btn-line btn-sm" aria-expanded={condOpen} onClick={() => setCondOpen((v) => !v)}>
            {condOpen ? '조건 접기' : '조건 바꾸기'}
          </button>
        </div>
        <form className="card cond-full col" style={{ gap: 22 }} onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <span className="field-label">매달 얼마?</span>
            <label className="radio">
              <input type="radio" name="svAmt" checked={amountMode === 'pace'} onChange={() => setAmountMode('pace')} />
              <div>
                <b>
                  정산 주기마다 평균 남긴 돈 <span className="tag-ex">예시</span>
                </b>
                <span>{won(pace)}원 · 최근 정산 주기 앱 기록 기준</span>
              </div>
            </label>
            <label className="radio">
              <input type="radio" name="svAmt" checked={amountMode === 'manual'} onChange={() => setAmountMode('manual')} />
              <div>
                <b>직접 입력</b>
                <span>1천 원 단위</span>
              </div>
            </label>
            {amountMode === 'manual' && (
              <input className="input" type="number" min={1000} step={1000} inputMode="numeric" aria-label="매달 넣을 돈(원)" value={draft} onChange={(e) => setDraft(e.target.value)} />
            )}
          </div>
          <div className="field">
            <span className="field-label">기간</span>
            <div className="seg fill" role="group" aria-label="기간">
              {TERMS.map((t) => (
                <button key={t} type="button" aria-pressed={term === t} onClick={() => setTerm(t)}>
                  {t}개월
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">적립 방식</span>
            <label className="radio">
              <input type="radio" name="svType" checked={reserveType === 'FIXED'} onChange={() => setReserveType('FIXED')} />
              <div>
                <b>정액적립식</b>
                <span>매달 같은 금액</span>
              </div>
            </label>
            <label className="radio">
              <input type="radio" name="svType" checked={reserveType === 'FREE'} onChange={() => setReserveType('FREE')} />
              <div>
                <b>자유적립식</b>
                <span>금액을 그때그때</span>
              </div>
            </label>
          </div>
          <div className="field">
            <span className="field-label">금융권</span>
            <div className="checks">
              <label className="check">
                <input type="checkbox" checked={sectors.includes('BANK')} onChange={() => toggleSector('BANK')} />
                은행
              </label>
              <label className="check">
                <input type="checkbox" checked={sectors.includes('SAVINGS_BANK')} onChange={() => toggleSector('SAVINGS_BANK')} />
                저축은행
              </label>
            </div>
          </div>
          <p className="meta">우대조건은 상품 상세에서 원문을 확인하세요. 계산에 넣지 않아요.</p>
        </form>
      </aside>

      <div className="col">
        {list.isPending ? (
          <Loading h={320} />
        ) : list.isError ? (
          <ErrorCard error={list.error} onRetry={() => list.refetch()} onReset={reset} />
        ) : items.length === 0 ? (
          <div className="empty-box">
            <h3>이 조건으로 계산할 상품이 없어요</h3>
            <p className="sub">기간이나 적립 방식, 금융권을 바꿔 보세요.</p>
          </div>
        ) : (
          <>
            <div className="card">
              <p className="story">
                같은 조건으로 계산한 상품 {items.length}개예요. 만기 세후 이자는 {won(Math.min(...afterTax))}원~{won(Math.max(...afterTax))}원이에요.{' '}
                {list.data.isSample && <span className="tag-ex">예시</span>}
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
                  <caption className="sr-only">적금 상품 목록</caption>
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
                      <tr key={p.id} className={openId === p.id ? 'sel' : ''}>
                        <td>
                          <button type="button" className="btn-text sv-name" onClick={() => open(p.id)}>
                            {p.name}
                          </button>
                          <div className="meta">
                            {p.company} {p.sector === 'SAVINGS_BANK' && <span className="tag">저축은행</span>}
                          </div>
                        </td>
                        <td className="r">{pct(p.baseRate)}</td>
                        <td className="r">{pct(p.maxRate)}</td>
                        <td className="r">
                          <div>{won(p.result.maturityAmount)}원</div>
                          <div className="meta">이자 {won(p.result.interestAfterTax)}원</div>
                          {p.result.excludedAmount > 0 && <div className="meta">한도 초과 {won(p.result.excludedAmount)}원은 넣지 못함</div>}
                        </td>
                        <td>
                          <input type="checkbox" className="sv-cmp" aria-label={`${p.name} 비교에 넣기`} checked={cmp.includes(p.id)} onChange={(e) => toggleCompare(p.id, e.target.checked)} />
                        </td>
                      </tr>
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
            <CompareCard items={picked} monthly={monthly} term={term} limit={compareLimit} />
            <Notice text={list.data.notice} />
          </>
        )}
      </div>

      <div className={'rail-col' + (railOpen ? ' open' : '')}>
        <ProductDetail id={openId} term={term} monthly={monthly} onClose={() => setRailOpen(false)} />
      </div>
    </div>
  );
}

/* ───────── 그때 들었다면 ───────── */

function PastMode({ from, to }: { from: string; to: string }) {
  const avg = useAverageSavings({ from, to });
  if (avg.isPending) return <Loading />;
  if (avg.isError) return <ErrorCard error={avg.error} onRetry={() => avg.refetch()} />;
  const a = avg.data;
  const last = a.rates[a.rates.length - 1];
  return (
    <div className="g84">
      <div className="col">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>
                {a.name} {a.isSample && <span className="tag-ex">예시</span>}
              </h2>
              <p className="meta">{a.source}</p>
            </div>
          </div>
          <p className="story">
            그동안 남긴 {won(a.principal)}원을 그때그때 적금에 넣었다면 지금 {won(a.total)}원이에요.
          </p>
          <div className="stats" style={{ marginTop: 16 }}>
            <div className="stat">
              <span className="lbl">넣은 돈</span>
              <p className="val num">{won(a.principal)}원</p>
            </div>
            <div className="stat">
              <span className="lbl">세후 이자</span>
              <p className="val num">{won(a.interestAfterTax)}원</p>
              <span className="meta">세전 {won(a.interestPreTax)}원 · 세금 {won(a.tax)}원</span>
            </div>
            <div className="stat">
              <span className="lbl">합계</span>
              <p className="val num">{won(a.total)}원</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <caption>달마다 넣은 돈과 그달 평균 금리</caption>
              <thead>
                <tr>
                  <th>달</th>
                  <th className="r">평균 금리</th>
                  <th className="r">넣은 돈 누적</th>
                  <th className="r">세후 가치</th>
                </tr>
              </thead>
              <tbody>
                {a.series.map((s) => (
                  <tr key={s.month}>
                    <td>{ym(s.month)}</td>
                    <td className="r">{pct(a.rates.find((r) => r.month === s.month)?.rate ?? 0)}</td>
                    <td className="r">{won(s.principal)}원</td>
                    <td className="r">{won(s.valueAfterTax)}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Notice text={a.notice} />
      </div>
      <aside className="col rail" aria-label="계산 가정">
        <div className="card">
          <h2>이렇게 계산했어요</h2>
          {last && <p className="meta">최신 금리 {ym(last.month)} 연 {pct(last.rate)}</p>}
          <Assumptions items={a.assumptions} />
        </div>
      </aside>
    </div>
  );
}

/* ───────── 정책 적금 ───────── */

function PolicyResult({ req, rules }: { req: PolicySimulateRequest; rules: PolicySavingsRules }) {
  const sim = usePolicySimulation(req);
  if (sim.isPending) return <Loading h={160} />;
  if (sim.isError) return <ErrorCard error={sim.error} onRetry={() => sim.refetch()} />;
  const s = sim.data;
  const parts = [
    { k: '내가 넣은 돈', v: s.principal, c: 'var(--s1)' },
    { k: '이자', v: s.interestPreTax, c: 'var(--s3)' },
    { k: '정부기여금', v: s.govContribution, c: 'var(--s4)' },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <h2>
          {rules.name} 결과 {s.isSample && <span className="tag-ex">예시</span>}
        </h2>
        {s.verificationStatus === 'UNVERIFIED' && <span className="tag">기여금 적립 방식 확인 중 · 추정</span>}
      </div>
      <p className="story">
        만기에 모두 {won(s.total)}원을 받는다고 계산했어요.
      </p>
      <div className="sv-stack" role="img" aria-label={parts.map((p) => `${p.k} ${won(p.v)}원`).join(', ')}>
        {parts.map((p) => (
          <span key={p.k} style={{ flexGrow: p.v, background: p.c }} />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        {parts.map((p) => (
          <span key={p.k}>
            <i className="box" style={{ background: p.c }} />
            {p.k} <b className="num">{won(p.v)}원</b>
          </span>
        ))}
      </div>
      <div className="card-sunken" style={{ marginTop: 16 }}>
        <p className="meta">같은 돈을 {s.averageSavingsComparison.name}에 넣었다면(연 {pct(s.averageSavingsComparison.rate)}, 세후)</p>
        <p style={{ fontWeight: 700 }} className="num">
          {won(s.averageSavingsComparison.total)}원 · 세후 이자 {won(s.averageSavingsComparison.interestAfterTax)}원
        </p>
      </div>
      <Assumptions items={s.assumptions} />
    </div>
  );
}

function PolicyForm({ rules, pace }: { rules: PolicySavingsRules; pace: number }) {
  const defaults: PolicySimulateRequest = { code: rules.code, monthly: Math.min(pace, rules.maxMonthly), termMonths: rules.termMonths, type: 'GENERAL', bankRate: rules.defaultBankRate };
  const [monthly, setMonthly] = useState(String(defaults.monthly));
  const [type, setType] = useState<PolicyType>('GENERAL');
  const [rate, setRate] = useState(String(defaults.bankRate));
  const [note, setNote] = useState('');
  const [req, setReq] = useState<PolicySimulateRequest>(defaults);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = toThousand(monthly);
    const r = Number(rate);
    if (m == null || !Number.isFinite(r) || r < 0) {
      setNote('월 납입액과 금리를 확인해 주세요');
      return;
    }
    const capped = Math.min(m, rules.maxMonthly);
    setNote(m > rules.maxMonthly ? `월 최대 ${won(rules.maxMonthly)}원이라 ${won(rules.maxMonthly)}원으로 맞췄어요` : '');
    setMonthly(String(capped));
    setReq({ code: rules.code, monthly: capped, termMonths: rules.termMonths, type, bankRate: r });
  };

  return (
    <div className="g84">
      <div className="col">
        <form className="card col" style={{ gap: 18 }} onSubmit={submit}>
          <div>
            <h2>
              {rules.name} 조건 직접 입력 {rules.isSample && <span className="tag-ex">예시</span>}
            </h2>
            <p className="meta">
              {rules.termMonths}개월 만기 · 월 최대 {won(rules.maxMonthly)}원 · {rules.taxFree ? '이자 비과세' : '이자 과세'} · 자격은 판정하지 않아요
            </p>
          </div>
          <div className="field">
            <label htmlFor="pMonthly">월 납입액(원)</label>
            <input id="pMonthly" className="input" type="number" min={1000} step={1000} inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            <span className="meta">기본값은 내 저축 속도 {won(pace)}원</span>
          </div>
          <div className="field">
            <span className="field-label">유형</span>
            <div className="seg fill" role="group" aria-label="유형">
              {(['GENERAL', 'PREFERRED'] as PolicyType[]).map((t) => (
                <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                  {t === 'GENERAL' ? '일반형' : '우대형'} {rules.contributionRates[t]}%
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="pRate">적용 금리(연 %)</label>
            <input id="pRate" className="input" type="number" min={0} step={0.01} value={rate} onChange={(e) => setRate(e.target.value)} />
            <span className="meta">기본값은 최신 은행 평균 적금 금리예요. 취급 은행 공시 금리로 바꿔 넣으세요.</span>
          </div>
          {note && (
            <p className="form-error" role="status">
              {note}
            </p>
          )}
          <button className="btn btn-primary">이 조건으로 계산하기</button>
        </form>
        <PolicyResult req={req} rules={rules} />
        <Notice text={rules.notice} />
      </div>
      <aside className="col rail" aria-label="자격 조건 확인">
        <div className="card">
          <h2>자격 조건 확인하기</h2>
          <p className="meta">스스로 확인하는 목록이에요. 가입할 수 있는지 판정하지 않아요.</p>
          <div className="checks" style={{ marginTop: 12 }}>
            {rules.checklist.map((c) => (
              <label key={c} className="check">
                <input type="checkbox" />
                {c}
              </label>
            ))}
          </div>
          <hr className="hair" />
          {rules.sourceUrl ? (
            <a href={rules.sourceUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
              공식 안내 보기 ↗
            </a>
          ) : (
            <p className="meta">공식 안내 링크는 확인 중이에요.</p>
          )}
          <p className="meta" style={{ marginTop: 6 }}>
            규칙 기준일 {rules.asOf}
          </p>
        </div>
      </aside>
    </div>
  );
}

function PolicyMode({ pace }: { pace: number }) {
  const rules = usePolicySavings(POLICY_CODE);
  if (rules.isPending) return <Loading />;
  if (rules.isError) return <ErrorCard error={rules.error} onRetry={() => rules.refetch()} />;
  return <PolicyForm rules={rules.data} pace={pace} />;
}

/* ───────── 화면 ───────── */

export default function Savings() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('mode');
  const mode: Mode = raw === 'past' || raw === 'policy' ? raw : 'now';
  const { status } = useSession();
  const sub = useSubscription(status === 'member');
  const seed = useSeedMoney();
  const pace = seed.data?.avgPerCycle ?? FALLBACK_PACE;
  const compareLimit = sub.data?.plan === 'PLUS' ? COMPARE_LIMIT.PLUS : COMPARE_LIMIT.FREE;
  const history = seed.data?.history ?? [];

  const setMode = (m: Mode) =>
    setParams(
      (p) => {
        if (m === 'now') p.delete('mode');
        else p.set('mode', m);
        return p;
      },
      { replace: true },
    );

  return (
    <section>
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">적금 비교</h1>
            <p className="page-desc">같은 돈을 적금에 넣었다면 만기에 얼마를 받는지, 기본금리·최고금리·기간으로 정렬해요.</p>
          </div>
          <div className="seg sv-modes" role="group" aria-label="비교 방식">
            {MODES.map((o) => (
              <button key={o.m} aria-pressed={mode === o.m} onClick={() => setMode(o.m)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {seed.isPending ? (
          <Loading />
        ) : mode === 'now' ? (
          <NowMode key={pace} pace={pace} compareLimit={compareLimit} />
        ) : mode === 'past' ? (
          history.length === 0 ? (
            <div className="empty-box">
              <h3>아직 남긴 돈 기록이 없어요</h3>
              <p className="sub">정산 주기가 끝나면 그동안 남긴 돈으로 계산해요. 지금 상품은 금액을 직접 넣어 비교할 수 있어요.</p>
              <button className="btn btn-primary" onClick={() => setMode('now')}>
                지금 가입하면 보기
              </button>
            </div>
          ) : (
            <PastMode from={history[0].month + '-01'} to={seed.data?.asOf ?? ''} />
          )
        ) : (
          <PolicyMode pace={pace} />
        )}
      </div>
    </section>
  );
}
