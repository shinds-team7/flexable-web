// 목돈 비교(지금 가입하면): 예금·파킹·CMA 세 화면이 같이 쓰는 구성. 위에서부터 종류 탭 · 금융권/대표 은행 줄(맨 끝 [상세 필터]) · 조건 칩 · 상품 줄 목록 · 고른 상품 비교 칸.
// 적금 비교(Savings.tsx)와 같은 모양이다. 적금과 다른 점: 매달 넣는 돈 대신 처음에 한 번 넣는 돈(amount)을 받고, 적립 방식 대신 단리·복리를 거른다.
// 순위·추천 문장·가입 버튼은 두지 않는다(팀장 확정 6). 금액은 모두 서버 결과를 그대로 그린다(ADR-3).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { LineLegend, MultiLineChart, seriesColor } from '@/charts/MultiLineChart';
import { shortBankName } from '@/components/BankBadge';
import { BankStrip } from '@/components/BankStrip';
import { AmountInput, FilterChips, SelectedBar, TermTrack } from '@/components/CompareFilters';
import { Icon } from '@/components/Icons';
import { ProductRow } from '@/components/ProductRow';
import { ErrorCard, Loading, Notice, ScrollTopButton } from '@/components/ProductCompareParts';
import { ProductTabs } from '@/components/ProductTabs';
import {
  useDepositCompanies,
  useDepositProduct,
  useDepositProducts,
  useDepositSimulation,
  useDepositSimulations,
  type DepositProduct,
  lumpReady,
  type LumpKind,
} from '@/data/deposit';
import { useSubscription } from '@/data/plans';
import type { InterestType, SavingsSort, SavingsTerm, Sector } from '@/data/savings';
import { errorText } from '@/lib/api';
import { won } from '@/lib/format';

type Kind = {
  noun: string;
  amountLabel: string;
  byTerm: boolean; // 기간을 고르는 상품인지(정기예금). 파킹·CMA는 정해진 기간이 없어 1년 기준으로 본다
  strip: 'bank' | 'broker';
  categories?: string[]; // 상품 종류 필터(CMA). TODO(BE): 서버가 주는 목록으로 바꾼다(#143)
  caution?: string;
};

const KINDS: Record<LumpKind, Kind> = {
  deposit: {
    noun: '예금',
    amountLabel: '맡길 돈',
    byTerm: true,
    strip: 'bank',
  },
  parking: {
    noun: '파킹통장',
    amountLabel: '넣어 둘 돈',
    byTerm: false,
    strip: 'bank',
    caution: '파킹통장 금리는 언제든 바뀔 수 있고, 우대 한도를 넘는 돈에는 기본금리가 적용될 수 있어요.',
  },
  cma: {
    noun: 'CMA',
    amountLabel: '넣어 둘 돈',
    byTerm: false,
    strip: 'broker',
    categories: ['RP형', 'MMF형', '종금형', '발행어음형'],
    caution: 'CMA는 증권사 상품이라 상품에 따라 예금자보호 대상이 아닐 수 있어요. 상품 설명서에서 꼭 확인해 주세요.',
  },
};

const TERMS: SavingsTerm[] = [6, 12, 24, 36];
const SORTS: { s: SavingsSort; label: string }[] = [
  { s: 'BASE_RATE', label: '기본금리 높은 순' },
  { s: 'MAX_RATE', label: '최고금리 높은 순' },
  { s: 'TERM', label: '기간순' },
];
const INTEREST: { v: InterestType; label: string }[] = [
  { v: 'SIMPLE', label: '단리' },
  { v: 'COMPOUND', label: '복리' },
];
const QUICK = [1_000_000, 5_000_000, 10_000_000, 30_000_000];
const DEFAULT_AMOUNT = 10_000_000;
// TODO(BE): 비교 개수는 설정값(무료 2 / 플러스 5). GET /billing/plans의 limits로 바꾼다(적금과 같다)
const COMPARE_LIMIT = { FREE: 2, PLUS: 5 };
const ALL: Sector[] = ['BANK', 'SAVINGS_BANK'];
const ALL_SIZE = 1000; // 쪽 나누기 없이 전체를 한 번에 받는다

const pct = (r: number) => r.toFixed(2) + '%';
const ym = (s: string) => {
  const [y, m] = s.split('-');
  return `${y}.${m}`;
};
const typeLabel = (t: InterestType) => (t === 'SIMPLE' ? '단리' : '월복리');
const manWon = (n: number) => (n % 10_000 === 0 ? `${won(n / 10_000)}만 원` : `${won(n)}원`);

/** 표에서 상품 줄을 누르면 그 줄 아래에 펼쳐지는 상세. */
function ProductDetail({ kind, p: row, term, amount }: { kind: LumpKind; p: DepositProduct; term: SavingsTerm; amount: number }) {
  const detail = useDepositProduct(kind, row.id, term, row.interestType);
  const max = useDepositSimulation(kind, { productId: row.id, amount, termMonths: term, interestType: row.interestType, rateBasis: 'MAX' });
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
            {p.rateLimit != null && (
              <div className="set-row">
                <span className="k">우대 한도</span>
                <span className="v">{won(p.rateLimit)}원까지 우대금리, 넘는 돈은 기본금리가 달라질 수 있어요</span>
              </div>
            )}
            {p.category && (
              <div className="set-row">
                <span className="k">상품 종류</span>
                <span className="v">{p.category}</span>
              </div>
            )}
            {p.depositProtected !== null && (
              <div className="set-row">
                <span className="k">예금자보호</span>
                <span className="v">{p.depositProtected ? '보호 대상' : '보호 대상이 아니에요'}</span>
              </div>
            )}
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
function MoneyOverTime({ kind, picked, amount, term, asTable }: { kind: LumpKind; picked: Picked[]; amount: number; term: SavingsTerm; asTable: boolean }) {
  const sims = useDepositSimulations(
    kind,
    picked.map(({ p }) => ({ productId: p.id, amount, termMonths: term, interestType: p.interestType, rateBasis: 'BASE' as const })),
  );
  const failed = sims.find((q) => q.isError);
  const head = (
    <>
      <h3 className="sec-title sv-h3">기간 동안 내 돈</h3>
      <p className="meta">
        {KINDS[kind].byTerm
          ? '넣은 돈 위에 달마다 쌓이는 이자예요(세전, 기본금리). 중간에 해지하면 이 금리를 다 받지 못해요.'
          : '넣어 둔 돈 위에 달마다 쌓이는 이자예요(세전, 기본금리). 금리가 바뀌면 이자도 달라져요.'}
      </p>
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

/** 금리·이자만으로는 같은 선에서 비교되지 않는 조건을 나란히 놓는다: 예금은 이자 방식, 파킹은 우대 한도, CMA는 상품 종류·예금자보호. 모두 공시 값 그대로다. */
function ConditionTable({ kind, picked }: { kind: LumpKind; picked: Picked[] }) {
  const yn = (v: boolean | null) => (v === null ? '확인 중' : v ? '대상' : '대상 아님');
  const cols: { h: string; v: (p: DepositProduct) => string }[] = [
    { h: '최고금리', v: (p) => pct(p.maxRate) },
    ...(kind === 'deposit' ? [{ h: '이자 방식', v: (p: DepositProduct) => typeLabel(p.interestType) }] : []),
    ...(kind === 'parking' ? [{ h: '우대 한도', v: (p: DepositProduct) => (p.rateLimit ? `${won(p.rateLimit)}원까지` : '한도 없음') }] : []),
    ...(kind === 'cma'
      ? [
          { h: '상품 종류', v: (p: DepositProduct) => p.category ?? '확인 중' },
          { h: '예금자보호', v: (p: DepositProduct) => yn(p.depositProtected) },
        ]
      : []),
    { h: '가입 한도', v: (p) => (p.maxLimit == null ? '없음' : `${won(p.maxLimit)}원`) },
  ];
  return (
    <>
      <h3 className="sec-title sv-h3">조건 비교</h3>
      {kind !== 'deposit' && <p className="meta">금리 말고도 다른 조건이 있어요. 이자만 보고 고르지 말고 아래 조건도 같이 봐 주세요.</p>}
      <div className="table-wrap">
        <table>
          <caption className="sr-only">고른 상품의 조건 비교</caption>
          <thead>
            <tr>
              <th>상품</th>
              {cols.map((c) => (
                <th key={c.h} className="r">
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {picked.map(({ p }) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                {cols.map((c) => (
                  <td key={c.h} className="r">
                    {c.v(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CompareCard({ kind, picked, amount, term, limit }: { kind: LumpKind; picked: Picked[]; amount: number; term: SavingsTerm; limit: number }) {
  const k = KINDS[kind];
  const [asTable, setAsTable] = useState(false);
  const when = k.byTerm ? '만기' : '1년';
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
            최대 {limit}개 + 이자 0% · {manWon(amount)} · {k.byTerm ? `${term}개월` : '1년 기준'}
          </p>
        </div>
        {picked.length > 0 && (
          <button className="btn btn-line btn-sm" aria-expanded={asTable} aria-controls="dpCmpTable" onClick={() => setAsTable((v) => !v)}>
            {asTable ? '그래프로 보기' : '표로 보기'}
          </button>
        )}
      </div>
      {picked.length === 0 ? (
        <p className="sub">목록의 비교 칸을 체크하면 {when} 세후 이자와 기간 동안 내 돈을 나란히 볼 수 있어요.</p>
      ) : asTable ? (
        <div className="table-wrap" id="dpCmpTable">
          <table>
            <caption>고른 상품 비교</caption>
            <thead>
              <tr>
                <th>상품</th>
                <th className="r">기본금리</th>
                <th className="r">세후 이자</th>
                <th className="r">{when}에 받는 돈</th>
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
            {when}에 받는 세후 이자(기본금리 기준)
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
      {picked.length > 0 && <MoneyOverTime kind={kind} picked={picked} amount={amount} term={term} asTable={asTable} />}
      {picked.length > 0 && <ConditionTable kind={kind} picked={picked} />}
    </div>
  );
}


/** 상품 줄 아래 태그: 금융권, 이자 방식(예금), 상품 종류·예금자보호(CMA), 우대 한도(파킹) */
function rowTags(k: Kind, p: DepositProduct): string[] {
  return [
    ...(p.sector === 'SAVINGS_BANK' ? ['저축은행'] : []),
    ...(k.byTerm ? [typeLabel(p.interestType)] : []),
    ...(p.category ? [p.category] : []),
    ...(p.depositProtected === true ? ['예금자보호'] : p.depositProtected === false ? ['예금자보호 아님'] : []),
    ...(p.rateLimit ? [`${manWon(p.rateLimit)}까지 우대`] : []),
  ];
}

function NowMode({ kind, compareLimit }: { kind: LumpKind; compareLimit: number }) {
  const k = KINDS[kind];
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [term, setTerm] = useState<SavingsTerm>(12);
  const [interestType, setInterestType] = useState<InterestType | null>(null);
  const [sectors, setSectors] = useState<Sector[]>(['BANK']); // 비어 있으면 둘 다
  const [categories, setCategories] = useState<string[]>([]); // 비어 있으면 전체
  const [sort, setSort] = useState<SavingsSort>('BASE_RATE');
  const [companyNames, setCompanyNames] = useState<string[]>([]); // 비어 있으면 전체
  const [cmp, setCmp] = useState<Picked[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lockMsg, setLockMsg] = useState('');

  const companies = useDepositCompanies(kind);
  // 은행 이름을 골랐으면 그 은행만 보이도록 금융권은 묻지 않는다
  const effSectors = companyNames.length > 0 || sectors.length === 0 ? ALL : sectors;
  const list = useDepositProducts(
    kind,
    {
      amount,
      termMonths: k.byTerm ? term : 12,
      sort,
      direction: sort === 'TERM' ? 'ASC' : 'DESC',
      interestType,
      sectors: effSectors,
      companies: companyNames,
      categories,
      page: 1,
      size: ALL_SIZE,
    },
    amount > 0,
  );
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const calcTerm: SavingsTerm = k.byTerm ? term : 12;

  // 계산 조건이 바뀌면 비교 목록을 비운다(이전 조건으로 계산한 값이라서)
  const companyKey = companyNames.join('|');
  const sectorKey = effSectors.join('|');
  useEffect(() => setCmp([]), [amount, calcTerm, interestType, companyKey, sectorKey, categories.join('|')]);

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
  const reset = () => {
    setAmount(DEFAULT_AMOUNT);
    setTerm(12);
    setInterestType(null);
    setSectors(['BANK']);
    setCompanyNames([]);
    setCategories([]);
  };

  const catChip = k.categories
    ? [
        {
          id: 'category',
          label: '상품 종류',
          count: categories.length,
          panel: (
            <div className="cf-pgroup" role="group" aria-label="상품 종류">
              {k.categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="cf-opt"
                  aria-pressed={categories.includes(c)}
                  onClick={() => setCategories(categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c])}
                >
                  {c}
                </button>
              ))}
            </div>
          ),
        },
      ]
    : [];
  const chips = [
    {
      id: 'amount',
      label: k.byTerm ? '기간·금액' : '금액',
      panel: (
        <>
          {k.byTerm && <TermTrack terms={TERMS} value={term} onChange={setTerm} />}
          <div className="cf-quick" role="group" aria-label="자주 쓰는 금액">
            {QUICK.map((v) => (
              <button key={v} type="button" aria-pressed={amount === v} onClick={() => setAmount(v)}>
                {manWon(v)}
              </button>
            ))}
          </div>
          <AmountInput value={amount} unit={10_000} label={`${k.amountLabel}(원)`} onApply={setAmount} />
        </>
      ),
    },
    ...(k.byTerm
      ? [
          {
            id: 'type',
            label: '이자 방식',
            count: interestType ? 1 : 0,
            panel: (
              <div className="cf-pgroup" role="group" aria-label="이자 방식">
                {INTEREST.map((o) => (
                  <button key={o.v} type="button" className="cf-opt" aria-pressed={interestType === o.v} onClick={() => setInterestType(interestType === o.v ? null : o.v)}>
                    {o.label}
                  </button>
                ))}
              </div>
            ),
          },
        ]
      : []),
    ...catChip,
  ];
  const selected = [
    ...sectors.map((s) => ({ key: s, label: s === 'BANK' ? (k.strip === 'bank' ? '1금융권' : '증권사') : '저축은행', onRemove: () => setSectors(sectors.filter((x) => x !== s)) })),
    ...companyNames.map((n) => ({ key: n, label: shortBankName(n), onRemove: () => setCompanyNames(companyNames.filter((x) => x !== n)) })),
    { key: 'amount', label: manWon(amount) },
    ...(k.byTerm ? [{ key: 'term', label: `${term}개월` }] : [{ key: 'term', label: '1년 기준' }]),
    ...categories.map((c) => ({ key: c, label: c, onRemove: () => setCategories(categories.filter((x) => x !== c)) })),
    ...(interestType ? [{ key: 'type', label: typeLabel(interestType), onRemove: () => setInterestType(null) }] : []),
  ];

  return (
    <div className="col">
      <div className="card cmp-top">
        <ProductTabs kind={kind} />
        <BankStrip
          companies={companies.data ?? []}
          sectors={sectors}
          onSectors={setSectors}
          picked={companyNames}
          onPicked={setCompanyNames}
          variant={k.strip}
        />
      </div>
      <div className="card">
        <FilterChips chips={chips} />
        <SelectedBar items={selected} onReset={reset} />
      </div>

      {k.caution && <Notice text={k.caution} />}
      <p className="meta">우대조건은 상품 상세에서 원문을 확인하세요. 계산에 넣지 않아요.</p>
      <div className="sv-main">
        <div className="col">
          {list.isPending ? (
            <Loading h={320} />
          ) : list.isError ? (
            <ErrorCard noun={k.noun} error={list.error} onRetry={() => list.refetch()} onReset={reset} />
          ) : total === 0 ? (
            <div className="empty-box">
              <h3>이 조건으로 계산할 상품이 없어요</h3>
              <p className="sub">금융권이나 은행, 이자 방식, 금액을 바꿔 보세요.</p>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="toolbar" style={{ marginBottom: 4 }}>
                  <p className="cmp-count">
                    <b className="num">{total}</b>개 {list.data.isSample && <span className="tag-ex">예시</span>}
                  </p>
                  <span className="spacer" />
                  <label className="field sv-sort">
                    <span className="sr-only">정렬</span>
                    <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SavingsSort)}>
                      {SORTS.filter((o) => k.byTerm || o.s !== 'TERM').map((o) => (
                        <option key={o.s} value={o.s}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="meta" style={{ marginBottom: 8 }}>
                  같은 조건으로 계산한 {k.byTerm ? '만기' : '1년'} 세후 이자는 {won(list.data.minInterestAfterTax ?? 0)}원~{won(list.data.maxInterestAfterTax ?? 0)}원이에요 · {ym(list.data.disclosureMonth)} 공시 기준 ·
                  광고로 순서를 바꾸지 않아요
                  {list.data.noRateCount > 0 && ` · 금리 정보 없음 ${list.data.noRateCount}개`}
                </p>
                <ul className="pr-list" aria-label={`${k.noun} 상품 목록`}>
                  {items.map((p) => (
                    <ProductRow
                      key={p.id}
                      p={p}
                      tags={rowTags(k, p)}
                      gotLabel={k.byTerm ? '만기 세후 수령액' : '1년 뒤 세후 수령액'}
                      open={openId === p.id}
                      onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                      checked={cmp.some((x) => x.p.id === p.id)}
                      onCheck={(on) => toggleCompare(p, on)}
                      detail={<ProductDetail kind={kind} p={p} term={calcTerm} amount={amount} />}
                    />
                  ))}
                </ul>
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
            <CompareCard kind={kind} picked={cmp} amount={amount} term={calcTerm} limit={compareLimit} />
          ) : (
            <div className="card">
              <h2>고른 상품 비교</h2>
              <p className="sub" style={{ marginTop: 8 }}>
                목록의 비교 칸을 2개 이상 체크하면 {k.byTerm ? '만기' : '1년'} 세후 이자를 여기에서 나란히 볼 수 있어요.
              </p>
            </div>
          )}
        </div>
      </div>
      <ScrollTopButton />
    </div>
  );
}

/** 데이터 출처가 정해지기 전의 파킹·CMA. 메뉴에서는 숨기고 주소로 들어오면 이 안내만 보인다. */
function ComingSoon({ kind }: { kind: LumpKind }) {
  return (
    <section>
      <div className="page wip">
        <div className="card col" style={{ gap: 12 }}>
          <h1 className="page-title">{KINDS[kind].noun} 비교는 준비 중이에요</h1>
          <p className="sub">믿고 볼 수 있는 공시 데이터를 확인하는 중이라 아직 열지 않았어요.</p>
          <p className="meta">예금·적금 비교는 지금 쓸 수 있어요.</p>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/deposit" className="btn btn-primary">예금 비교 보기</Link>
            <Link to="/savings" className="btn">적금 비교 보기</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function LumpSum({ kind }: { kind: LumpKind }) {
  const { status } = useSession();
  const sub = useSubscription(status === 'member');
  const compareLimit = status === 'guest' || sub.data?.plan === 'PLUS' ? COMPARE_LIMIT.PLUS : COMPARE_LIMIT.FREE;
  if (!lumpReady(kind)) return <ComingSoon kind={kind} />;
  return (
    <section>
      <div className="page">
        <NowMode key={kind} kind={kind} compareLimit={compareLimit} />
      </div>
    </section>
  );
}

export const Deposit = () => <LumpSum kind="deposit" />;
export const Parking = () => <LumpSum kind="parking" />;
export const Cma = () => <LumpSum kind="cma" />;
