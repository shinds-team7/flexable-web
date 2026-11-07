import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ProductTabs } from '@/components/ProductTabs';
import { BankBadge, shortBankName } from '@/components/BankBadge';
import { SelectedBar } from '@/components/CompareFilters';
import { Icon } from '@/components/Icons';
import { api, errorText } from '@/lib/api';
import { won } from '@/lib/format';
import type { components } from '@/lib/api-schema';
import '@/styles/cash-catalog.css';

type Product = components['schemas']['CashCatalogProduct'];
type Catalog = components['schemas']['CashCatalogList'];
type Sim = components['schemas']['ParkingSimulation'];
type Kind = 'parking' | 'cma';
type Tag = Product['tags'][number];
// 상품명·공시 조건 원문에 이 문구가 있다는 뜻이다(policies §10). 가입 자격이나 우대 적용을 판정하지 않는다
const TAG_GROUPS: { title: string; tags: { id: Tag; label: string }[] }[] = [
  { title: '상품 유형', tags: [{ id: 'YOUTH', label: '청년' }, { id: 'MILITARY', label: '군인' }] },
  { title: '우대조건·가입 방식', tags: [{ id: 'NON_FACE_TO_FACE', label: '비대면 가입' }, { id: 'SALARY_LINK', label: '급여 연동' }, { id: 'AUTO_TRANSFER', label: '자동이체' }, { id: 'CARD_USE', label: '카드 사용' }] },
];
const TAG_LABEL = new Map(TAG_GROUPS.flatMap(g => g.tags.map(t => [t.id, t.label] as const)));
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

// 서버가 계산한다(policies §11). 공시 기본금리만 쓰고 우대·이벤트·금액 구간은 넣지 않는다
function ParkingCalc({ product }: { product: Product }) {
  const [amount, setAmount] = useState('10000000');
  const [days, setDays] = useState('30');
  const calc = useMutation({
    mutationFn: () => api<Sim>('/parking/simulate', { method: 'POST', json: { productId: product.id, amount: Number(amount), days: Number(days) } }),
  });
  const valid = /^\d+$/.test(amount) && Number(amount) >= 1 && /^\d+$/.test(days) && Number(days) >= 1;
  if (!product.calculable) return <p className="cash-calc-off">이자 계산 안내: {product.calcReason}</p>;
  return <details className="cash-calc"><summary>예상 이자 계산해 보기 (기본금리 기준)</summary>
    <form onSubmit={e => { e.preventDefault(); if (valid) calc.mutate(); }}>
      <label>맡길 돈 (원)<input inputMode="numeric" value={amount ? Number(amount).toLocaleString('ko-KR') : ''} onChange={e => { setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 11)); calc.reset(); }} /></label>
      <label>맡기는 기간 (일)<input inputMode="numeric" value={days} onChange={e => { setDays(e.target.value.replace(/[^\d]/g, '')); calc.reset(); }} /></label>
      <button className="btn" type="submit" disabled={!valid || calc.isPending}>계산하기</button>
    </form>
    <div role="status" aria-live="polite">
      {calc.isError && <p className="cash-calc-error">{errorText(calc.error)}</p>}
      {calc.data && <dl className="cash-calc-result">
        <div><dt>세전 이자</dt><dd className="num">{won(calc.data.interestPreTax)}원</dd></div>
        <div><dt>세금 (15.4%)</dt><dd className="num">{won(calc.data.tax)}원</dd></div>
        <div><dt>세후 이자</dt><dd className="num"><b>{won(calc.data.interestAfterTax)}원</b></dd></div>
      </dl>}
      {calc.data && <p className="cash-calc-note">{calc.data.notice}</p>}
    </div>
  </details>;
}

export function CashCatalog({ kind }: { kind: Kind }) {
  const [search, setSearch] = useState('');
  const [condition, setCondition] = useState('');
  const [company, setCompany] = useState('');
  const [sector, setSector] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [sort, setSort] = useState('NAME');
  const query = useQuery({ queryKey: ['cash-catalog', kind], queryFn: () => api<Catalog>(`/${kind}/products`), staleTime: 300_000 });
  const all = query.data?.items ?? [];
  const companies = [...new Set(all.map(p => p.company))];
  const matches = (text: string, word: string) => text.toLocaleLowerCase('ko-KR').includes(word.trim().toLocaleLowerCase('ko-KR'));
  const visible = all.filter(p => (!company || p.company === company) && (!sector || p.sector === sector)
    && (!category || p.category === category) && tags.every(t => p.tags.includes(t)) && matches(`${p.company} ${p.name}`, search)
    && matches([p.conditions, p.interestPayment, p.reinvestment].filter(Boolean).join(' '), condition))
    .sort((a, b) => {
      const field = sort === 'BASE' ? 'baseRate' : 'maxRate';
      return (sort === 'NAME' ? 0 : (b[field] ?? -Infinity) - (a[field] ?? -Infinity))
        || a.company.localeCompare(b.company, 'ko-KR') || a.name.localeCompare(b.name, 'ko-KR');
    });
  const selected = all.filter(p => picked.includes(p.id));
  const toggle = (id: string) => {
    if (picked.includes(id)) { setPicked(picked.filter(p => p !== id)); setMessage(''); }
    else if (selected.length < 3) { setPicked([...selected.map(p => p.id), id]); setMessage(''); }
    else setMessage('상품은 최대 3개까지 비교할 수 있어요. 선택한 상품을 먼저 해제해 주세요.');
  };
  const noun = kind === 'parking' ? '파킹통장' : 'CMA';
  const reset = () => { setSearch(''); setCondition(''); setCompany(''); setSector(''); setCategory(''); setTags([]); };
  const toggleTag = (t: Tag) => setTags(tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t]);
  const filters = [
    ...(search ? [{ key: 'search', label: search, onRemove: () => setSearch('') }] : []),
    ...(condition ? [{ key: 'condition', label: condition, onRemove: () => setCondition('') }] : []),
    ...(company ? [{ key: 'company', label: company, onRemove: () => setCompany('') }] : []),
    ...(sector ? [{ key: 'sector', label: sector === 'BANK' ? '은행' : '저축은행', onRemove: () => setSector('') }] : []),
    ...(category ? [{ key: 'category', label: category === 'RP' ? 'RP형' : '발행어음형', onRemove: () => setCategory('') }] : []),
    ...tags.map(t => ({ key: `tag-${t}`, label: `원문에 ${TAG_LABEL.get(t)}`, onRemove: () => toggleTag(t) })),
  ];
  return <section className="cash-catalog"><div className="page col">
    <div className="card cmp-top cash-top">
      <ProductTabs kind={kind} autoGuide={false} />
      <header className="cash-heading">
        <div><p className="cash-eyebrow">잠시 머무는 돈도, 조건부터 꼼꼼하게</p><h1>{noun} 비교</h1>
          <p className="sub">{kind === 'cma' ? 'RP형·발행어음형의 공시 약정수익률과 조건을 한눈에 살펴보세요.' : '공시 금리부터 적용 한도까지, 내게 맞는 조건을 살펴보세요.'}</p></div>
        <span className="cash-heading-icon" aria-hidden="true"><Icon id="i-sliders" size={28} /></span>
      </header>
      {companies.length > 0 && <div className="cash-companies" role="group" aria-label="금융회사 빠른 선택">
        <button className="bank-card" aria-pressed={!company} onClick={() => setCompany('')}><span className="cash-all-icon"><Icon id="i-sliders" size={24} /></span><span>전체 회사</span></button>
        {companies.map(c => <button className="bank-card" key={c} aria-pressed={company === c} onClick={() => setCompany(company === c ? '' : c)}><BankBadge name={c} size={32} /><span>{shortBankName(c)}</span></button>)}
      </div>}
    </div>
    <section className="card cash-filter-card" aria-label="상품 검색 조건">
      <div className="cash-filters">
        <label>상품·회사 검색<div className="cash-search"><Icon id="i-search" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} type="search" placeholder="상품명이나 금융회사" /></div></label>
        <label>금액·우대조건 검색<input value={condition} onChange={e => setCondition(e.target.value)} type="search" placeholder="공시 원문의 문구로 검색" /></label>
        <label>금융회사<select value={company} onChange={e => setCompany(e.target.value)}><option value="">전체 회사</option>{companies.map(c => <option key={c}>{c}</option>)}</select></label>
        {kind === 'parking' ? <label>금융권<select value={sector} onChange={e => setSector(e.target.value)}><option value="">전체 금융권</option><option value="BANK">은행</option><option value="SAVINGS_BANK">저축은행</option></select></label>
          : <label>상품 종류<select value={category} onChange={e => setCategory(e.target.value)}><option value="">전체 종류</option><option value="RP">RP형</option><option value="PROMISSORY_NOTE">발행어음형</option></select></label>}
      </div>
      <div className="cash-tag-filters">
        {TAG_GROUPS.map(g => <div key={g.title} className="cash-tag-group" role="group" aria-label={g.title}>
          <span className="cash-tag-title">{g.title}</span>
          {g.tags.map(t => <button key={t.id} type="button" className="cash-tag" aria-pressed={tags.includes(t.id)} onClick={() => toggleTag(t.id)}>{t.label}</button>)}
        </div>)}
        <p className="cash-tag-note">공시 원문에 해당 문구가 있는 상품만 보여 줘요. 가입 자격과 우대 적용은 원문에서 확인해 주세요.</p>
      </div>
      <SelectedBar items={filters.length ? filters : [{ key: 'all', label: '전체 상품' }]} onReset={reset} />
    </section>
    <div className="cash-notice"><Icon id="i-info" size={20} /><p>{kind === 'cma' ? 'CMA는 원금 손실 가능성이 있고 약정수익률은 변경될 수 있어요. 예금자보호 여부를 상품별로 확인하세요.' : '파킹통장 금리는 변경될 수 있어요. 높은 금리가 적용되는 금액 구간과 우대조건을 함께 확인하세요.'}</p></div>
    <div className="sv-main cash-main">
      <section className="card cash-results" aria-label={`${noun} 상품 목록`}>
        <div className="cash-results-head"><h2>공시 상품 <span className="cash-count num">{visible.length}</span></h2>
          <label className="cash-sort"><span className="cash-sr">상품 정렬</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="NAME">금융회사·상품명순</option><option value="BASE">기본금리·약정수익률 높은 순</option><option value="MAX">최고금리·수익률 높은 순</option></select></label>
        </div>
        <p className="meta">세전 연 기준 · 적용 금액과 조건에 따라 달라져요</p>
        {query.isPending && <div className="cash-empty" role="status"><span className="dots-spinner" aria-hidden="true" /><p>공시 자료를 불러오는 중이에요.</p></div>}
        {query.isError && <div className="cash-empty" role="alert"><h3>공시 자료를 불러오지 못했어요</h3><p className="sub">{errorText(query.error)}</p><button className="btn" onClick={() => void query.refetch()}>다시 불러오기</button></div>}
        {query.data && visible.length === 0 && <div className="cash-empty"><Icon id="i-search" size={28} /><h3>{all.length ? '조건에 맞는 상품이 없어요' : '공시 자료를 준비하고 있어요'}</h3><p className="sub">{all.length ? '검색어나 금융회사, 상품 종류, 원문 문구 필터를 바꿔 보세요.' : '확인된 상품이 등록되면 이곳에서 볼 수 있어요.'}</p>{all.length > 0 && <button className="btn" onClick={reset}>조건 초기화</button>}</div>}
        <div className="cash-products">{visible.map(p => {
          const checked = selected.some(s => s.id === p.id);
          return <article className={'cash-product' + (checked ? ' cash-picked' : '')} key={p.id}>
            <div className="cash-product-main"><BankBadge name={p.company} size={40} />
              <div className="cash-product-info"><h3>{p.name}</h3><p className="meta">{p.company}</p><div className="cash-tags"><span className="tag">{categoryName(p.category)}</span><span className="tag">{p.depositProtected == null ? '예금자보호 미확인' : p.depositProtected ? '예금자보호 대상' : '예금자보호 대상 아님'}</span></div></div>
              <div className="cash-rate"><span>{p.rateType === 'AGREED' ? '약정수익률' : '기본금리'}</span><strong className="num">{rate(p.baseRate)}</strong><small>최고 {rate(p.maxRate)}</small></div>
              <label className="cash-check"><input type="checkbox" checked={checked} onChange={() => toggle(p.id)} aria-label={`${p.company} ${p.name} 비교`} /><span>비교</span></label>
            </div>
            <p className="cash-limit"><span>최고금리 적용 금액</span><b>{limit(p.rateLimit)}</b></p>
            {kind === 'parking' && <ParkingCalc product={p} />}
            <details><summary>조건·출처 자세히 보기</summary><dl>{rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value(p)}</dd></div>)}</dl><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">공식 출처: {p.sourceName} ↗<span className="cash-sr"> (새 창)</span></a></details>
          </article>;
        })}</div>
        {query.data && <p className="cash-source-note">{query.data.notice}</p>}
      </section>
      <aside className="sv-rail cash-rail" aria-labelledby="cash-compare-title"><section className="card">
        <div className="cash-results-head"><h2 id="cash-compare-title">고른 상품 비교</h2><span className="cash-pick-count" aria-live="polite">{selected.length}/3</span></div>
        <p className="sub">최대 3개를 골라 금리와 조건을 나란히 확인하세요.</p>
        <p className="cash-message" role="status">{message}</p>
        {selected.length === 0 ? <div className="cash-compare-empty"><Icon id="i-check" size={24} /><p>궁금한 상품의<br /><b>비교 칸을 체크해 주세요</b></p></div> : <ul className="cash-picks">{selected.map(p => <li key={p.id}><BankBadge name={p.company} size={32} /><div><p className="meta">{p.company}</p><b>{p.name}</b></div><button type="button" className="cash-remove" onClick={() => toggle(p.id)} aria-label={`${p.company} ${p.name} 비교 해제`}><Icon id="i-close" size={16} /></button></li>)}</ul>}
        {selected.length > 0 && <><a className="btn cash-compare-link" href="#cash-comparison">조건 비교표 보기 <span aria-hidden="true">↓</span></a><button className="cash-clear" onClick={() => { setPicked([]); setMessage(''); }}>선택 모두 해제</button></>}
        <div className="cash-rail-note"><b>금리만큼 조건도 중요해요</b><p>적용 한도 · 이자 지급 · 예금자보호</p><p>{kind === 'parking' ? '예상 이자는 공시 기본금리로만 계산해요.' : '예상 이자를 계산하지 않는 공시 비교예요.'}</p></div>
      </section></aside>
    </div>
    {selected.length > 0 && <section className="card cash-comparison" id="cash-comparison"><div className="cash-results-head"><h2>선택한 상품 조건 비교</h2><span className="cash-pick-count">{selected.length}개 선택</span></div><p className="sub">같은 금리여도 적용 금액·보유 기간·조건이 다를 수 있어요.</p>
      <div className="cash-table-wrap" tabIndex={0} role="region" aria-label="선택 상품 조건 비교, 가로 스크롤 가능"><table><caption>최대 3개 상품의 공시 조건 비교</caption><thead><tr><th scope="col">조건</th>{selected.map(p => <th key={p.id} scope="col">{p.company}<br />{p.name}<br /><button className="btn" onClick={() => toggle(p.id)}>비교 해제<span className="cash-sr"> {p.company} {p.name}</span></button></th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{selected.map(p => <td key={p.id}>{row.value(p)}</td>)}</tr>)}<tr><th scope="row">공식 출처</th>{selected.map(p => <td key={p.id}><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{p.sourceName} (새 창)</a></td>)}</tr></tbody></table></div>
    </section>}
  </div></section>;
}
