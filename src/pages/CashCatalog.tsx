import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ProductTabs } from '@/components/ProductTabs';
import { api, errorText } from '@/lib/api';
import type { components } from '@/lib/api-schema';
import '@/styles/cash-catalog.css';

type Product = components['schemas']['CashCatalogProduct'];
type Catalog = components['schemas']['CashCatalogList'];
type Kind = 'parking' | 'cma';
const categoryName = (category: Product['category']) => category === 'RP' ? 'RP형' : category === 'PROMISSORY_NOTE' ? '발행어음형' : '파킹통장';
const rate = (value: number | null) => value == null ? '미확인' : `${value.toFixed(2)}%`;
const limit = (value: number | null) => value == null ? '미확인' : `${value.toLocaleString('ko-KR')}원`;
const rows: { label: string; value: (p: Product) => string }[] = [
  { label: '상품 종류', value: p => categoryName(p.category) },
  { label: '기본금리·약정수익률 (세전 연)', value: p => rate(p.baseRate) },
  { label: '최고금리·수익률 (세전 연)', value: p => rate(p.maxRate) },
  { label: '최고금리 적용 가능 금액', value: p => limit(p.rateLimit) },
  { label: '가입 한도', value: p => limit(p.maxLimit) },
  { label: '예금자보호', value: p => p.depositProtected == null ? '미확인' : p.depositProtected ? '대상 (상품 공시 확인)' : '대상 아님' },
  { label: '금액·기간 구간과 우대조건', value: p => p.conditions },
  { label: '이자·수익 지급', value: p => p.interestPayment ?? '미확인' },
  { label: '재투자 조건', value: p => p.reinvestment ?? '미확인' },
  { label: '공시 기준일', value: p => p.sourceAsOf ?? '미확인' },
  { label: '적용 시작일', value: p => p.effectiveFrom ?? '미확인' },
  { label: '자료 검증 시각 (한국시간)', value: p => new Date(p.verifiedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) },
];

export function CashCatalog({ kind }: { kind: Kind }) {
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [sector, setSector] = useState('');
  const [category, setCategory] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const query = useQuery({ queryKey: ['cash-catalog', kind], queryFn: () => api<Catalog>(`/${kind}/products`), staleTime: 300_000 });
  const all = query.data?.items ?? [];
  const companies = [...new Set(all.map(p => p.company))];
  const visible = all.filter(p => (!company || p.company === company) && (!sector || p.sector === sector)
    && (!category || p.category === category) && `${p.company} ${p.name}`.includes(search.trim()));
  const selected = all.filter(p => picked.includes(p.id));
  const toggle = (id: string) => {
    if (picked.includes(id)) { setPicked(picked.filter(p => p !== id)); setMessage(''); }
    else if (selected.length < 3) { setPicked([...selected.map(p => p.id), id]); setMessage(''); }
    else setMessage('상품은 최대 3개까지 비교할 수 있어요. 선택한 상품을 먼저 해제해 주세요.');
  };
  return <div className="col cash-catalog">
    <div className="card"><ProductTabs kind={kind} autoGuide={false} /></div>
    <section className="card">
      <h1>{kind === 'parking' ? '파킹통장 금리·조건 비교' : 'CMA 약정수익률·조건 비교'}</h1>
      <p className="sub">{kind === 'cma' ? 'RP형·발행어음형의 공시 약정수익률을 비교해요. 원금 손실 가능성이 있고 수익률은 변경될 수 있어요.' : '공시 금리와 적용 금액·우대조건을 함께 확인해요. 금리는 변경될 수 있어요.'}</p>
      <p className="sub">금액·기간별 조건을 확인해 주세요. 이 화면은 예상 이자를 계산하지 않아요.</p>
      {query.isPending && <p role="status">공시 자료를 불러오는 중이에요.</p>}
      {query.isError && <div role="alert"><p>{errorText(query.error)}</p><button className="btn" onClick={() => void query.refetch()}>다시 불러오기</button></div>}
      {query.data && <>
        <p role="status">{query.data.notice}</p>
        {all.length > 0 && <div className="cash-filters">
          <label>상품·회사 검색<input value={search} onChange={e => setSearch(e.target.value)} type="search" /></label>
          <label>금융회사<select value={company} onChange={e => setCompany(e.target.value)}><option value="">전체</option>{companies.map(c => <option key={c}>{c}</option>)}</select></label>
          {kind === 'parking' ? <label>금융권<select value={sector} onChange={e => setSector(e.target.value)}><option value="">전체</option><option value="BANK">은행</option><option value="SAVINGS_BANK">저축은행</option></select></label>
            : <label>상품 종류<select value={category} onChange={e => setCategory(e.target.value)}><option value="">전체</option><option value="RP">RP형</option><option value="PROMISSORY_NOTE">발행어음형</option></select></label>}
        </div>}
        <p aria-live="polite">조회 {visible.length}개 · 비교 선택 {selected.length}/3</p>
        <p role="status">{message}</p>
        {all.length > 0 && visible.length === 0 && <p>조건에 맞는 상품이 없어요.</p>}
        {visible.map(p => <article className="cash-product" key={p.id}>
          <h2>{p.name}</h2><p>{p.company} · {categoryName(p.category)}</p>
          <p className="cash-rate">{p.rateType === 'AGREED' ? '약정수익률' : '기본금리'} {rate(p.baseRate)} <span className="sub">세전 연 기준 · 최고 {rate(p.maxRate)}</span></p>
          <button className="btn" aria-pressed={selected.some(s => s.id === p.id)} onClick={() => toggle(p.id)}>{selected.some(s => s.id === p.id) ? '비교 해제' : '비교 선택'}<span className="cash-sr"> {p.company} {p.name}</span></button>
          <details><summary>조건·출처 자세히 보기</summary><dl>{rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value(p)}</dd></div>)}</dl><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">공식 출처: {p.sourceName} (새 창)</a></details>
        </article>)}
      </>}
    </section>
    {selected.length > 0 && <section className="card"><h2>선택한 상품 조건 비교</h2><p>같은 금리여도 적용 금액·보유 기간·조건이 다를 수 있어요.</p>
      <div className="cash-table-wrap" tabIndex={0} role="region" aria-label="선택 상품 조건 비교, 가로 스크롤 가능"><table><caption>최대 3개 상품의 공시 조건 비교</caption><thead><tr><th scope="col">조건</th>{selected.map(p => <th key={p.id} scope="col">{p.company}<br />{p.name}<br /><button className="btn" onClick={() => toggle(p.id)}>비교 해제<span className="cash-sr"> {p.company} {p.name}</span></button></th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{selected.map(p => <td key={p.id}>{row.value(p)}</td>)}</tr>)}<tr><th scope="row">공식 출처</th>{selected.map(p => <td key={p.id}><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{p.sourceName} (새 창)</a></td>)}</tr></tbody></table></div>
    </section>}
  </div>;
}
