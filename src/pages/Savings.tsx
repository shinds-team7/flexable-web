// 적금 비교(지금 가입하면): 조건 300px · 상품 표 · 고른 상품 상세 360px. 금융권에서 '정책 적금'을 고르면 상품 표 아래에 조건 직접 입력 카드가 붙는다.
// 2026-10-20 사용자 결정: [그때 들었다면] 탭은 없애고 [정책 적금] 탭은 금융권 선택지로 합쳤다. 설계는 docs/product/01-product.md F2, 02-design.md §5-5. 순위·추천 문장·가입 버튼은 두지 않는다(팀장 확정 6).
// 금액은 모두 서버 결과를 그대로 그린다(ADR-3). 막대 길이처럼 그리기 위한 비율만 화면에서 정한다.
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { LineLegend, MultiLineChart, seriesColor } from '@/charts/MultiLineChart';
import { Icon } from '@/components/Icons';
import { shortBankName } from '@/components/BankBadge';
import { BankStrip } from '@/components/BankStrip';
import { AmountInput, FilterChips, SelectedBar, TermTrack } from '@/components/CompareFilters';
import { ProductRow } from '@/components/ProductRow';
import { Assumptions, ErrorCard, Loading, Notice, ScrollTopButton } from '@/components/ProductCompareParts';
import { ProductTabs } from '@/components/ProductTabs';
import { useSeedMoney } from '@/data/home';
import { useSubscription } from '@/data/plans';
import {
  usePolicySavings,
  usePolicySimulation,
  useSavingsCompanies,
  useYouthPolicies,
  useSavingsProduct,
  useSavingsProducts,
  useSavingsSimulation,
  useSavingsSimulations,
  type PolicySavingsRules,
  type PolicyType,
  type ReserveType,
  type SavingsProduct,
  type YouthPolicy,
  type SavingsSort,
  type SavingsTerm,
  type Sector,
} from '@/data/savings';
import { errorText } from '@/lib/api';
import { won } from '@/lib/format';

const TERMS: SavingsTerm[] = [6, 12, 24, 36];
const SORTS: { s: SavingsSort; label: string }[] = [
  { s: 'BASE_RATE', label: '기본금리 높은 순' },
  { s: 'MAX_RATE', label: '최고금리 높은 순' },
  { s: 'TERM', label: '기간순' },
];
// TODO(BE): 비교 개수는 설정값(무료 2 / 플러스 5). GET /billing/plans의 limits로 바꾼다
const COMPARE_LIMIT = { FREE: 2, PLUS: 5 };
const REGIONS = ['서울', '부산', '대구', '인천', '광주·전남', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '경북', '경남', '제주'];
const ALL_SIZE = 1000; // 쪽 나누기 없이 전체를 한 번에 받는다
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

/* ───────── 지금 가입하면 ───────── */

/** 표에서 상품 줄을 누르면 그 줄 아래에 펼쳐지는 상세. */
function ProductDetail({ id, term, monthly, reserveType }: { id: string; term: SavingsTerm; monthly: number; reserveType: ReserveType }) {
  const detail = useSavingsProduct(id, term, reserveType);
  const max = useSavingsSimulation(
    id
      ? {
          productId: id,
          monthly,
          termMonths: term,
          reserveType,
          rateBasis: 'MAX',
        }
      : null,
  );
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
              {p.company} · {p.sector === 'BANK' ? '은행' : '저축은행'} · {ym(p.disclosureMonth)} 공시 기준
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
            <a
              href={p.disclosureUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 12,
                fontWeight: 600,
              }}
            >
              공시 원문 보기(금융상품한눈에) ↗
            </a>
          </>
        )
      )}
    </div>
  );
}

type Picked = { p: SavingsProduct; slot: number }; // slot = 비교에 넣을 때 받은 색 칸. 다른 상품을 빼도 바뀌지 않는다

/** 기간 동안 내 돈: 고른 상품마다 넣은 돈 위에 쌓이는 세전 이자 선(기본금리). 표로 보기면 달마다 표. */
function MoneyOverTime({ picked, monthly, term, asTable }: { picked: Picked[]; monthly: number; term: SavingsTerm; asTable: boolean }) {
  const sims = useSavingsSimulations(
    picked.map(({ p }) => ({ productId: p.id, monthly, termMonths: term, reserveType: p.reserveType, rateBasis: 'BASE' as const })),
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

function CompareCard({ picked, monthly, term, limit }: { picked: Picked[]; monthly: number; term: SavingsTerm; limit: number }) {
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
    {
      key: 'cash',
      name: '이자 없이 모아 둔 경우',
      sub: '연 0%',
      rate: 0,
      color: 'var(--baseline)',
      r: null,
    },
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
        {picked.length > 0 && (
          <button className="btn btn-line btn-sm" aria-expanded={asTable} aria-controls="svCmpTable" onClick={() => setAsTable((v) => !v)}>
            {asTable ? '그래프로 보기' : '표로 보기'}
          </button>
        )}
      </div>
      {picked.length === 0 ? (
        <p className="sub">표의 비교 칸을 체크하면 만기 세후 이자와 기간 동안 내 돈을 나란히 볼 수 있어요.</p>
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
                    <span
                      style={{
                        width: `${Math.max(1, (v / top) * 55)}%`,
                        background: x.color,
                      }}
                    />
                    <b className="num">{won(v)}원</b>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {picked.length > 0 && <MoneyOverTime picked={picked} monthly={monthly} term={term} asTable={asTable} />}
    </div>
  );
}

function YouthPolicyDetail({ p }: { p: YouthPolicy }) {
  const target = [
    p.minAge && p.maxAge ? `나이: 만 ${p.minAge}~${p.maxAge}세` : p.minAge ? `나이: 만 ${p.minAge}세 이상` : p.maxAge ? `나이: 만 ${p.maxAge}세 이하` : null,
    p.incomeNote,
    p.qualification,
    p.restriction && `제외 대상: ${p.restriction}`,
  ].filter(Boolean);
  return (
    <div className="sv-detail-body">
      <p className="meta">
        {p.agency}
        {p.operator && p.operator !== p.agency && ` · 운영 ${p.operator}`}
        {p.category && ` · ${p.category}`}
      </p>
      {p.summary && <p style={{ marginTop: 8 }}>{p.summary}</p>}
      {p.support && (
        <>
          <h3 className="sec-title sv-h3">지원 내용</h3>
          <p className="sv-cond">{p.support}</p>
        </>
      )}
      {target.length > 0 && (
        <>
          <h3 className="sec-title sv-h3">대상·조건</h3>
          <p className="sv-cond">{target.join('\n')}</p>
        </>
      )}
      {p.applyMethod && (
        <>
          <h3 className="sec-title sv-h3">신청 방법</h3>
          <p className="sv-cond">{p.applyMethod}</p>
        </>
      )}
      {p.documents && (
        <>
          <h3 className="sec-title sv-h3">제출 서류</h3>
          <p className="sv-cond">{p.documents}</p>
        </>
      )}
      <div className="set-row">
        <span className="k">신청 기간</span>
        <span className="v">{p.applyPeriod ?? '상시 또는 별도 공고'}</span>
      </div>
      {p.bizPeriod && (
        <div className="set-row">
          <span className="k">사업 기간</span>
          <span className="v">{p.bizPeriod}</span>
        </div>
      )}
      {(p.applyUrl || p.refUrl) && (
        <a href={(p.applyUrl ?? p.refUrl)!} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, fontWeight: 600 }}>
          신청·안내 페이지 ↗
        </a>
      )}
      <p className="meta" style={{ marginTop: 8 }}>
        온통청년 {p.dataAsOf} 기준 · 금리가 없는 지원 제도라 만기 금액은 계산하지 않아요
      </p>
    </div>
  );
}

/** 고른 정책 상품. 적금 표와 계산 방식이 달라 따로 보여 준다. */
function YouthPolicyBlock({ policies }: { policies: YouthPolicy[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>정책 상품 {policies.length}개</h2>
      <p className="meta" style={{ margin: '4px 0 8px' }}>
        청년 지원 제도라 금리 대신 지원 내용과 신청 기간을 보여 줘요. 자격은 판정하지 않아요.
      </p>
      {policies.length === 0 && <p className="sub">이 지역에 맞는 정책 상품이 없어요.</p>}
      <div className="sv-policy-list">
        {policies.map((p) => (
          <div key={p.id} className={'sv-policy' + (openId === p.id ? ' open' : '')}>
            <div
              className="sv-policy-row sv-row"
              role="button"
              tabIndex={0}
              aria-expanded={openId === p.id}
              onClick={() => setOpenId(openId === p.id ? null : p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenId(openId === p.id ? null : p.id);
                }
              }}
            >
              <div className="sv-name">{p.name}</div>
              <div className="meta">
                <span className="tag">{p.region}</span> {p.agency} · 신청 {p.applyPeriod ?? '상시 또는 별도 공고'}
              </div>
            </div>
            {openId === p.id && <YouthPolicyDetail p={p} />}
          </div>
        ))}
      </div>
    </div>
  );
}

type Kind = 'FINANCE' | 'POLICY';

function NowMode({ pace, compareLimit, initialPolicy }: { pace: number; compareLimit: number; initialPolicy: boolean }) {
  const [kind, setKind] = useState<Kind>('FINANCE'); // 금융상품(적금) / 정책상품. 둘 중 하나만 보여 준다
  const hasPace = pace > 0;
  const [amountMode, setAmountMode] = useState<'pace' | 'manual'>(hasPace ? 'pace' : 'manual');
  const [draft, setDraft] = useState(hasPace ? String(pace) : '');
  const [term, setTerm] = useState<SavingsTerm>(12);
  const [reserveType, setReserveType] = useState<ReserveType>('FIXED');
  const [sectors, setSectors] = useState<Sector[]>(['BANK']); // 비어 있으면 둘 다
  const policyOn = initialPolicy; // 소식 카드 [계산해 보기](?policy=1)로 들어왔을 때만 표 아래에 청년미래적금 계산 카드를 붙인다
  const [sort, setSort] = useState<SavingsSort>('BASE_RATE');
  const [companyNames, setCompanyNames] = useState<string[]>([]); // 비어 있으면 전체
  const [cmp, setCmp] = useState<Picked[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lockMsg, setLockMsg] = useState('');
  const [region, setRegion] = useState(''); // 정책상품 지역. '' = 전체, '전국' = 중앙부처
  const [withCentral, setWithCentral] = useState(false); // 지역을 고른 채로 중앙부처 정책도 함께 볼지

  const finance = kind === 'FINANCE';
  const centralLocked = region === '' || region === '전국'; // 전체·중앙부처를 고른 때는 이미 중앙부처가 정해져 있다
  const companies = useSavingsCompanies();
  const policies = useYouthPolicies([], !finance);

  // 은행 이름을 골랐으면 그 은행만 보이도록 금융권은 묻지 않는다
  const effSectors: Sector[] = companyNames.length > 0 || sectors.length === 0 ? ['BANK', 'SAVINGS_BANK'] : sectors;
  const monthly = amountMode === 'pace' ? pace : (toThousand(draft) ?? pace);
  const list = useSavingsProducts(
    {
      monthly,
      termMonths: term,
      sort,
      direction: sort === 'TERM' ? 'ASC' : 'DESC',
      reserveType,
      sectors: effSectors,
      companies: companyNames,
      page: 1,
      size: ALL_SIZE,
    },
    finance && monthly > 0,
  );
  const items = list.data?.items ?? [];
  const picked = cmp;
  const total = list.data?.total ?? 0;
  const expandedId = openId;

  // 계산 조건이 바뀌면 비교 목록을 비운다(이전 조건으로 계산한 값이라서)
  const companyKey = companyNames.join('|');
  useEffect(() => setCmp([]), [monthly, term, reserveType, companyKey, effSectors.join('|')]);

  const toggleCompare = (p: SavingsProduct, on: boolean) => {
    setLockMsg('');
    if (!on) return setCmp((c) => c.filter((x) => x.p.id !== p.id));
    if (picked.length >= compareLimit) {
      setLockMsg(`비교는 무료 ${COMPARE_LIMIT.FREE}개 · 플러스 ${COMPARE_LIMIT.PLUS}개까지예요`);
      return;
    }
    setCmp((c) => {
      let slot = 0;
      while (c.some((x) => x.slot === slot)) slot++; // 비어 있는 가장 앞 칸. 남은 상품의 색은 그대로 둔다
      return [...c, { p, slot }];
    });
  };
  const toggleOpen = (id: string) => setOpenId(expandedId === id ? null : id);
  const reset = () => {
    setAmountMode(hasPace ? 'pace' : 'manual');
    setDraft(hasPace ? String(pace) : '');
  };

  const resetAll = () => {
    reset();
    setTerm(12);
    setReserveType('FIXED');
    setSectors(['BANK']);
    setCompanyNames([]);
    setRegion('');
    setWithCentral(false);
  };
  const kindChip = {
    id: 'kind',
    label: finance ? '금융상품' : '정책상품',
    panel: (
      <div className="cf-pgroup" role="group" aria-label="상품 종류" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <button type="button" className="cf-opt" aria-pressed={finance} onClick={() => setKind('FINANCE')}>
          금융상품
        </button>
        <button type="button" className="cf-opt" aria-pressed={!finance} onClick={() => setKind('POLICY')}>
          정책상품
        </button>
      </div>
    ),
  };
  const chips = finance
    ? [
        kindChip,
        {
          id: 'amount',
          label: '기간·금액',
          panel: (
            <>
              <TermTrack terms={TERMS} value={term} onChange={setTerm} />
              <div className="cf-quick" role="group" aria-label="매달 넣을 돈">
                <button type="button" disabled={!hasPace} aria-pressed={amountMode === 'pace'} onClick={() => setAmountMode('pace')}>
                  {hasPace ? `평균 ${won(pace)}원` : '저축 속도 없음'} <span className="tag-ex">예시</span>
                </button>
              </div>
              <AmountInput
                value={amountMode === 'manual' ? monthly : 0}
                unit={1000}
                label="매달 넣을 돈(원, 1천 원 단위)"
                onApply={(n) => {
                  setAmountMode('manual');
                  setDraft(String(n));
                }}
              />
            </>
          ),
        },
        {
          id: 'reserve',
          label: '적립 방식',
          count: reserveType === 'FREE' ? 1 : 0,
          panel: (
            <div className="cf-pgroup" role="group" aria-label="적립 방식" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
              <button type="button" className="cf-opt" aria-pressed={reserveType === 'FIXED'} onClick={() => setReserveType('FIXED')}>
                정액적립식
              </button>
              <button type="button" className="cf-opt" aria-pressed={reserveType === 'FREE'} onClick={() => setReserveType('FREE')}>
                자유적립식
              </button>
            </div>
          ),
        },
      ]
    : [
        kindChip,
        {
          id: 'region',
          label: '지역',
          count: region ? 1 : 0,
          panel: (
            <div className="toolbar" style={{ gap: 16 }}>
              <select id="svRegion" className="input sv-region" aria-label="지역" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">전체</option>
                <option value="전국">중앙부처</option>
                {REGIONS.filter((r) => (policies.data ?? []).some((p) => p.region === r)).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <label className="check sv-central" title={centralLocked ? '지역을 고르면 선택할 수 있어요' : undefined}>
                <input type="checkbox" checked={withCentral || region === '' || region === '전국'} disabled={centralLocked} onChange={(e) => setWithCentral(e.target.checked)} />
                중앙부처도 함께 보기
              </label>
              <p className="meta sv-cond-note">지역을 고르면 그 지역 정책만 보여 줘요. 중앙부처 정책은 체크하면 같이 볼 수 있어요.</p>
            </div>
          ),
        },
      ];
  const selected = finance
    ? [
        ...sectors.map((s) => ({ key: s, label: s === 'BANK' ? '1금융권' : '저축은행', onRemove: () => setSectors(sectors.filter((x) => x !== s)) })),
        ...companyNames.map((n) => ({ key: n, label: shortBankName(n), onRemove: () => setCompanyNames(companyNames.filter((x) => x !== n)) })),
        { key: 'amt', label: `매달 ${won(monthly)}원` },
        { key: 'term', label: `${term}개월` },
        { key: 'rt', label: reserveType === 'FIXED' ? '정액적립식' : '자유적립식' },
      ]
    : [{ key: 'region', label: region === '' ? '전체 지역' : region === '전국' ? '중앙부처' : region, onRemove: region ? () => setRegion('') : undefined }];

  return (
    <div className="col">
      <div className="card cmp-top">
        <ProductTabs kind="savings" autoGuide={!initialPolicy} />
        <BankStrip companies={companies.data ?? []} sectors={sectors} onSectors={setSectors} picked={companyNames} onPicked={setCompanyNames} />
      </div>
      <div className="card">
        <FilterChips chips={chips} />
        <SelectedBar items={selected} onReset={resetAll} />
      </div>

      {finance ? (
        <>
          <p className="meta">우대조건은 상품 상세에서 원문을 확인하세요. 계산에 넣지 않아요.</p>
          <div className="sv-main">
            <div className="col">
              {monthly <= 0 ? (
                <div className="empty-box">
                  <h3>매달 넣을 돈을 입력해 주세요</h3>
                  <p className="sub">1,000원 이상 입력하면 같은 조건으로 적금 상품을 비교할 수 있어요.</p>
                </div>
              ) : list.isPending ? (
                <Loading h={320} />
              ) : list.isError ? (
                <ErrorCard error={list.error} onRetry={() => list.refetch()} onReset={reset} />
              ) : total === 0 ? (
                <div className="empty-box">
                  <h3>이 조건으로 계산할 상품이 없어요</h3>
                  <p className="sub">기간이나 적립 방식, 은행을 바꿔 보세요.</p>
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
                          {SORTS.map((o) => (
                            <option key={o.s} value={o.s}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="meta" style={{ marginBottom: 8 }}>
                      같은 조건으로 계산한 만기 세후 이자는 {won(list.data.minInterestAfterTax ?? 0)}원~{won(list.data.maxInterestAfterTax ?? 0)}원이에요 · {ym(list.data.disclosureMonth)} 공시
                      기준 · 광고로 순서를 바꾸지 않아요
                      {list.data.noRateCount > 0 && ` · 금리 정보 없음 ${list.data.noRateCount}개`}
                    </p>
                    <ul className="pr-list" aria-label="적금 상품 목록">
                      {items.map((p) => (
                        <ProductRow
                          key={p.id}
                          p={p}
                          tags={[...(p.sector === 'SAVINGS_BANK' ? ['저축은행'] : []), p.reserveType === 'FIXED' ? '정액적립식' : '자유적립식']}
                          open={expandedId === p.id}
                          onToggle={() => toggleOpen(p.id)}
                          checked={cmp.some((x) => x.p.id === p.id)}
                          onCheck={(on) => toggleCompare(p, on)}
                          detail={<ProductDetail id={p.id} term={term} monthly={monthly} reserveType={reserveType} />}
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
              {policyOn && monthly > 0 && <PolicySection monthly={monthly} term={term} />}
            </div>

            <div className="sv-rail">
              {picked.length >= 2 ? (
                <CompareCard picked={picked} monthly={monthly} term={term} limit={compareLimit} />
              ) : (
                <div className="card">
                  <h2>고른 상품 비교</h2>
                  <p className="sub" style={{ marginTop: 8 }}>
                    표의 비교 칸을 2개 이상 체크하면 만기 세후 이자를 여기에서 나란히 볼 수 있어요.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : policies.isPending ? (
        <Loading h={320} />
      ) : policies.isError ? (
        <ErrorCard error={policies.error} onRetry={() => policies.refetch()} />
      ) : policies.data.length === 0 ? (
        <div className="empty-box">
          <h3>아직 불러온 정책 상품이 없어요</h3>
          <p className="sub">잠시 뒤 다시 확인해 주세요.</p>
        </div>
      ) : (
        <YouthPolicyBlock policies={policies.data.filter((p) => !region || p.region === region || (withCentral && p.region === '전국'))} />
      )}
      <ScrollTopButton />
    </div>
  );
}

/* ───────── 정책 적금(금융권에서 고르면 상품 표 아래) ───────── */

function PolicyResult({
  code,
  monthly,
  termMonths,
  type,
  bankRate,
}: {
  code: string;
  monthly: number;
  termMonths: number;
  type: PolicyType;
  bankRate: number;
}) {
  const sim = usePolicySimulation({
    code,
    monthly,
    termMonths,
    type,
    bankRate,
  });
  if (sim.isPending) return <div className="skel" style={{ height: 120, marginTop: 16 }} />;
  if (sim.isError) return <ErrorCard error={sim.error} onRetry={() => sim.refetch()} />;
  const s = sim.data;
  const parts = [
    { k: '내가 넣은 돈', v: s.principal, c: 'var(--s1)' },
    { k: '이자', v: s.interestPreTax, c: 'var(--s3)' },
    { k: '정부기여금', v: s.govContribution, c: 'var(--s4)' },
  ];
  return (
    <>
      <p className="story" style={{ marginTop: 16 }}>
        만기에 모두 {won(s.total)}원을 받는다고 계산했어요. {s.isSample && <span className="tag-ex">예시</span>}
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
        <p className="meta">
          같은 돈을 {s.averageSavingsComparison.name}에 넣었다면(연 {pct(s.averageSavingsComparison.rate)}, 세후)
        </p>
        <p style={{ fontWeight: 700 }} className="num">
          {won(s.averageSavingsComparison.total)}원 · 세후 이자 {won(s.averageSavingsComparison.interestAfterTax)}원
        </p>
      </div>
      <Assumptions items={s.assumptions} />
    </>
  );
}

/** 월 납입액은 왼쪽 조건을 그대로 쓰고(월 최대를 넘으면 맞춤), 기간은 정책 적금 만기로 고정한다. 유형·금리만 여기서 고른다. */
function PolicyCard({ rules, monthly, term }: { rules: PolicySavingsRules; monthly: number; term: SavingsTerm }) {
  const [type, setType] = useState<PolicyType>('GENERAL');
  const [rateDraft, setRateDraft] = useState(String(rules.defaultBankRate));
  const [bankRate, setBankRate] = useState(rules.defaultBankRate);
  const [note, setNote] = useState('');
  const capped = Math.min(monthly, rules.maxMonthly);
  const adjusted = [
    monthly > rules.maxMonthly && `월 최대 ${won(rules.maxMonthly)}원이라 ${won(rules.maxMonthly)}원으로 계산해요.`,
    term !== rules.termMonths && `${rules.termMonths}개월 만기 상품이라 ${rules.termMonths}개월로 계산해요.`,
  ].filter((x): x is string => !!x);

  const applyRate = (e: FormEvent) => {
    e.preventDefault();
    const r = Number(rateDraft);
    if (rateDraft.trim() === '' || !Number.isFinite(r) || r < 0) {
      setNote('금리를 확인해 주세요');
      return;
    }
    setNote('');
    setBankRate(r);
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>
            {rules.name} <span className="tag">정책 적금</span> {rules.isSample && <span className="tag-ex">예시</span>}
          </h2>
          <p className="meta">
            매달 {won(capped)}원 · {rules.termMonths}개월 만기 · 월 최대 {won(rules.maxMonthly)}원 · {rules.taxFree ? '이자 비과세' : '이자 과세'} · 자격은
            판정하지 않아요
          </p>
        </div>
        {rules.verificationStatus === 'UNVERIFIED' && <span className="tag">기여금 적립 방식 확인 중 · 추정</span>}
      </div>
      {adjusted.length > 0 && <p className="meta">{adjusted.join(' ')}</p>}
      <form className="toolbar sv-policy-form" onSubmit={applyRate}>
        <div className="field">
          <span className="field-label">유형</span>
          <div className="seg" role="group" aria-label="정책 적금 유형">
            {(['GENERAL', 'PREFERRED'] as PolicyType[]).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                {t === 'GENERAL' ? '일반형' : '우대형'} {rules.contributionRates[t]}%
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pRate">
            적용 금리(연 %)
          </label>
          <div className="toolbar" style={{ gap: 8 }}>
            <input id="pRate" className="input" type="number" min={0} step={0.01} value={rateDraft} onChange={(e) => setRateDraft(e.target.value)} />
            <button className="btn btn-line btn-sm">금리 적용</button>
          </div>
        </div>
      </form>
      <p className="meta" style={{ marginTop: 6 }}>
        기본값은 최신 은행 평균 적금 금리예요. 취급 은행 공시 금리로 바꿔 넣으세요.
      </p>
      {note && (
        <p className="form-error" role="status">
          {note}
        </p>
      )}
      <PolicyResult code={rules.code} monthly={capped} termMonths={rules.termMonths} type={type} bankRate={bankRate} />
      <details className="sv-policy-check">
        <summary>자격 조건 확인하기</summary>
        <p>스스로 확인하는 목록이에요. 가입할 수 있는지 판정하지 않아요.</p>
        <div className="checks" style={{ marginTop: 12 }}>
          {rules.checklist.map((c) => (
            <label key={c} className="check">
              <input type="checkbox" />
              {c}
            </label>
          ))}
        </div>
        <p>
          {rules.sourceUrl ? (
            <a href={rules.sourceUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
              공식 안내 보기 ↗
            </a>
          ) : (
            '공식 안내 링크는 확인 중이에요.'
          )}{' '}
          · 규칙 기준일 {rules.asOf}
        </p>
      </details>
    </div>
  );
}

function PolicySection({ monthly, term }: { monthly: number; term: SavingsTerm }) {
  const rules = usePolicySavings(POLICY_CODE);
  if (rules.isPending) return <Loading h={160} />;
  if (rules.isError) return <ErrorCard error={rules.error} onRetry={() => rules.refetch()} />;
  return (
    <>
      <PolicyCard rules={rules.data} monthly={monthly} term={term} />
      <Notice text={rules.data.notice} />
    </>
  );
}

/* ───────── 화면 ───────── */

export default function Savings() {
  const [params] = useSearchParams();
  // 소식 카드 [계산해 보기]는 /savings?policy=1. 예전 탭 주소 ?mode=policy도 같은 뜻으로 받는다
  const initialPolicy = params.get('policy') === '1' || params.get('mode') === 'policy';
  const { status } = useSession();
  const sub = useSubscription(status === 'member');
  const seed = useSeedMoney();
  const pace = seed.data?.avgPerCycle ?? FALLBACK_PACE;
  const compareLimit = status === 'guest' || sub.data?.plan === 'PLUS' ? COMPARE_LIMIT.PLUS : COMPARE_LIMIT.FREE;

  return (
    <section>
      <div className="page">
        {seed.isPending ? <Loading /> : <NowMode key={pace} pace={pace} compareLimit={compareLimit} initialPolicy={initialPolicy} />}
      </div>
    </section>
  );
}
