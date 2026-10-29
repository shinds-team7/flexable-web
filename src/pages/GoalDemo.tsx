import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_PLANS, DEMO_PROFILES, GOAL_DEMO_CASES, type DemoCase, type DemoProfile } from '@/data/goalDemo';
import '@/styles/goal-demo.css';

type Mark = 'shield' | 'balance' | 'growth' | 'spark' | 'arrow' | 'check';

function MarkIcon({ kind, size = 24 }: { kind: Mark; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'shield' && <><path d="m12 3 7.5 3v5.5c0 4.5-4 7.8-7.5 9.5-3.5-1.7-7.5-5-7.5-9.5V6L12 3Z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></>}
    {kind === 'balance' && <><path d="M12 3v17M8 20h8M5 7h14M6 7l-3 7h6L6 7Zm12 0-3 7h6l-3-7Z" /><circle cx="12" cy="6" r="2" /></>}
    {kind === 'growth' && <><path d="M4 20V5M4 20h16M7 15l5-5 4 2 5-8M16 4h5v5" /></>}
    {kind === 'spark' && <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5L20 2Z" /></>}
    {kind === 'arrow' && <path d="M5 12h14m-5-5 5 5-5 5" />}
    {kind === 'check' && <path d="m5 12 4 4L19 6" />}
  </svg>;
}

const PLAN_COLORS = ['var(--color-series-3)', 'var(--color-series-1)', 'var(--color-series-4)'];
const PRODUCT_COLORS = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)'];
const toPath = (values: number[]) => values.map((y, i) => `${i ? 'L' : 'M'}${72 + i * 100},${24 + y * 2.15}`).join(' ');

function AssetChart({ sample, planId, compare }: { sample: DemoCase; planId: DemoProfile; compare: boolean }) {
  const gradientId = useId().replace(/:/g, '');
  const outcome = sample.outcomes[planId];
  const upper = outcome.highLine.map((y, i) => `${72 + i * 100},${24 + y * 2.15}`);
  const lower = outcome.lowLine.map((y, i) => `${72 + i * 100},${24 + y * 2.15}`).reverse();
  return <svg className="gd-chart" viewBox="0 0 750 280" role="img" aria-label={`${sample.goal}, ${sample.duration} 자산 흐름 예시. ${compare ? '세 조합 비교.' : `중앙값 ${outcome.median} 원, 예시 범위 ${outcome.low} 원부터 ${outcome.high} 원.`}`}>
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity=".16" /><stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity=".025" /></linearGradient></defs>
    {sample.axis.map((label, i) => {
      const y = 24 + i * 215 / (sample.axis.length - 1);
      return <g key={label}><line x1="72" y1={y} x2="672" y2={y} stroke="var(--color-border)" strokeDasharray="3 5" /><text x="57" y={y + 4} textAnchor="end" className="gd-axis-label">{label}</text></g>;
    })}
    {!compare && <polygon points={[...upper, ...lower].join(' ')} fill={`url(#${gradientId})`} />}
    <line x1="72" y1={24 + sample.targetY * 2.15} x2="672" y2={24 + sample.targetY * 2.15} stroke="var(--color-text-secondary)" strokeDasharray="5 5" />
    <rect x="584" y={15 + sample.targetY * 2.15} width="94" height="19" fill="var(--color-surface)" />
    <text x="670" y={28 + sample.targetY * 2.15} textAnchor="end" className="gd-target-label">목표 {sample.target}</text>
    <path d={toPath(sample.principalLine)} stroke="var(--color-baseline)" strokeWidth="1.6" strokeDasharray="3 5" fill="none" />
    {compare ? DEMO_PLANS.map((plan, i) => <path key={plan.id} d={toPath(sample.outcomes[plan.id].medianLine)} fill="none" stroke={PLAN_COLORS[i]} strokeWidth={plan.id === planId ? 3.5 : 2} strokeDasharray={i === 2 ? '7 4' : undefined} />)
      : <><path d={toPath(outcome.medianLine)} fill="none" stroke="var(--color-brand-primary)" strokeWidth="3.5" /><circle cx="672" cy={24 + outcome.medianLine.at(-1)! * 2.15} r="5" fill="var(--color-brand-primary)" stroke="var(--color-surface)" strokeWidth="3" /></>}
    {sample.periods.map((label, i) => <text key={label} x={72 + i * 100} y="269" textAnchor="middle" className="gd-axis-label">{label}</text>)}
  </svg>;
}

export default function GoalDemo() {
  const [profile, setProfile] = useState<DemoProfile>('balanced');
  const [draftId, setDraftId] = useState('home');
  const [sample, setSample] = useState(GOAL_DEMO_CASES[0]);
  const [selected, setSelected] = useState<DemoProfile>('balanced');
  const [compare, setCompare] = useState(false);
  const [loading, setLoading] = useState(false);
  const [announced, setAnnounced] = useState('균형형 성향과 3년 뒤 1억 원 조건의 예시를 보고 있어요.');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<DemoProfile>('balanced');
  const result = useRef<HTMLDivElement>(null);
  const draft = GOAL_DEMO_CASES.find((item) => item.id === draftId)!;
  const plan = DEMO_PLANS.find((item) => item.id === selected)!;
  const outcome = sample.outcomes[selected];
  const changed = draftId !== sample.id;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const pickProfile = (id: DemoProfile) => {
    profileRef.current = id;
    setProfile(id);
    setSelected(id);
    setAnnounced(`${DEMO_PROFILES.find((item) => item.id === id)!.name}을 선택했어요. 같은 목표 조건에서 세 조합을 계속 비교할 수 있어요.`);
  };

  const showSample = () => {
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      setSample(draft);
      setSelected(profileRef.current);
      setLoading(false);
      setAnnounced(`${draft.name}, ${DEMO_PROFILES.find((item) => item.id === profileRef.current)!.name}의 예시 시나리오를 불러왔어요. 실제 AI 계산 결과는 아니에요.`);
      result.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }, 550);
  };

  return <div className="gd-page" data-sample={sample.isSample}>
    <div className="gd-wrap">
      <div className="gd-breadcrumb"><Link to="/home">홈</Link><span>/</span><span>AI 목표 달성</span><span className="gd-sample-badge">시연 · 예시</span></div>
      <header className="gd-heading">
        <div><div className="gd-eyebrow"><MarkIcon kind="spark" size={17} /> 나의 목표, 나다운 방법으로</div><h1>목표까지 가는 길은<br className="gd-mobile-break" /> 하나가 아니니까.</h1><p>내 성향과 상황에 맞는 조합을 찾고, 가능성과 위험을 함께 살펴보세요.</p></div>
        <div className="gd-heading-note"><span className="gd-dot" /> 예시 데이터로 체험 중<small>입력·선택 내용은 저장되지 않아요</small></div>
      </header>

      <section className="gd-profile-section" aria-labelledby="gd-profile-title">
        <div className="gd-section-heading"><h2 id="gd-profile-title"><span className="gd-step">01</span> 내 투자 성향</h2><p>지금 선택된 성향이에요. 다른 카드를 눌러 바꿀 수 있어요.</p></div>
        <div className="gd-profiles" role="radiogroup" aria-label="투자 성향 예시 선택">
          {DEMO_PROFILES.map((item) => <label key={item.id} className={`gd-profile ${profile === item.id ? 'is-selected' : ''}`}>
            <input type="radio" name="goal-demo-profile" value={item.id} checked={profile === item.id} onChange={() => pickProfile(item.id)} />
            <span className="gd-profile-icon"><MarkIcon kind={item.icon} size={28} /></span>
            <span className="gd-profile-copy"><span className="gd-profile-title">{item.name}<span>{item.caption}</span></span><small>{item.description}</small></span>
            <span className="gd-radio-mark">{profile === item.id && <MarkIcon kind="check" size={13} />}</span>
          </label>)}
        </div>
      </section>

      <div className="gd-workspace">
        <aside className="gd-conditions" aria-labelledby="gd-conditions-title">
          <div className="gd-section-heading"><h2 id="gd-conditions-title"><span className="gd-step">02</span> 나의 목표 조건</h2></div>
          <div className="gd-goal-card">
            <label className="gd-field-label" htmlFor="gd-case">목표 예시 바꾸기</label>
            <select id="gd-case" className="gd-select" value={draftId} onChange={(event) => setDraftId(event.target.value)}>{GOAL_DEMO_CASES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <div className="gd-goal-name"><span className="gd-goal-icon"><MarkIcon kind="growth" size={25} /></span><span>{draft.goal}<small>도착하고 싶은 금액</small></span></div>
            <p className="gd-target-amount num">{draft.target}</p>
            <dl className="gd-condition-list"><div><dt>현재 모은 돈</dt><dd>{draft.current}</dd></div><div><dt>매달 저축·투자할 돈</dt><dd>{draft.monthly}</dd></div><div><dt>목표까지 남은 시간</dt><dd>{draft.duration}</dd></div></dl>
            <div className="gd-principal-note"><span>이자·투자 수익 없이 모으면</span><strong className="num">{draft.principal}</strong></div>
            <button className="gd-primary" onClick={showSample} disabled={loading}>{loading ? '예시 시나리오 준비 중…' : '이 조건으로 시나리오 보기'}{!loading && <MarkIcon kind="arrow" size={18} />}</button>
            <p className="gd-form-help">준비된 3가지 목표로 화면을 체험해요.<br />실제 금액 계산·AI 예측은 연결 전이에요.</p>
          </div>
          <div className="gd-side-note"><MarkIcon kind="shield" size={21} /><div><strong>가능성만큼, 감당할 위험도</strong><p>성향을 바꿔도 목표가 보장되지는 않아요. 원금 손실 가능성도 꼭 함께 봐 주세요.</p></div></div>
        </aside>

        <div className="gd-results" ref={result} aria-busy={loading}>
          <div className="gd-section-heading gd-results-heading"><div><h2><span className="gd-step">03</span> 목표에 다가가는 세 가지 방법</h2><p>{sample.summary}</p></div><span className="gd-sample-badge">고정 예시</span></div>
          {changed && <div className="gd-pending" role="status">목표 조건을 바꿨어요. 왼쪽의 ‘시나리오 보기’를 누르면 선택한 예시로 바뀌어요.</div>}
          {sample.caution && <div className="gd-caution"><MarkIcon kind="shield" size={22} /><div><strong>{sample.caution}</strong><p>원금 {sample.principal}과 목표 {sample.target} 사이의 차이가 커요. 높은 위험만으로 목표가 해결되지는 않아요.</p></div></div>}
          <div className={`gd-scenario-grid ${loading ? 'is-loading' : ''}`} role="radiogroup" aria-label="비교할 시나리오">
            {DEMO_PLANS.map((item, index) => {
              const itemOutcome = sample.outcomes[item.id];
              return <label key={item.id} className={`gd-scenario ${selected === item.id ? 'is-selected' : ''}`}>
                <input type="radio" name="goal-demo-plan" value={item.id} checked={selected === item.id} onChange={() => { setSelected(item.id); setAnnounced(`${item.title}의 예시 상세를 보고 있어요.`); }} />
                <span className="gd-scenario-top"><span className="gd-plan-number">PLAN 0{index + 1}</span>{profile === item.id && <span className="gd-profile-match">선택한 성향</span>}</span>
                <h3>{item.title}</h3><p className="gd-scenario-sub">{item.subtitle}</p>
                <span className="gd-chance-label">목표 달성 추정 <span>예시</span></span><strong className="gd-chance num">{itemOutcome.chance}</strong>
                <span className="gd-chance-track"><span style={{ width: `${itemOutcome.chanceBar}%` }} /></span>
                <span className="gd-scenario-bottom"><span>위험 수준 <b>{item.risk}</b></span><span className="gd-radio-mark">{selected === item.id && <MarkIcon kind="check" size={13} />}</span></span>
              </label>;
            })}
          </div>

          <section className="gd-chart-card" aria-labelledby="gd-chart-title">
            <div className="gd-chart-heading"><div><div className="gd-eyebrow">선택한 조합의 자산 흐름</div><h2 id="gd-chart-title">{plan.title}<span className="gd-sample-badge">예시</span></h2></div><div className="gd-chart-switch" role="group" aria-label="차트 보기"><button aria-pressed={!compare} onClick={() => setCompare(false)}>예상 범위</button><button aria-pressed={compare} onClick={() => setCompare(true)}>세 조합 비교</button></div></div>
            <div className="gd-outcome-heading"><div><span>{sample.duration} 뒤 예상 자산 · 중앙값</span><strong className="num">{outcome.median}<small> 원</small></strong></div><div className="gd-range-label">잘 풀리지 않을 때부터<br /><b>{outcome.low} ~ {outcome.high} 원</b></div></div>
            <AssetChart sample={sample} planId={selected} compare={compare} />
            <div className="gd-chart-legend">{compare ? DEMO_PLANS.map((item, i) => <span key={item.id}><i style={{ background: PLAN_COLORS[i] }} />{item.title}</span>) : <><span><i />예상 자산 중앙값</span><span><i className="gd-legend-range" />하위 10% ~ 상위 10% 사이</span></>}<span><i className="gd-legend-principal" />넣은 돈</span></div>
            <div className="gd-risk-row"><div><span>목표 달성 추정 확률</span><strong>{outcome.chance}<small> 예시</small></strong></div><div><span>만기에 납입원금보다 적을 가능성</span><strong>{outcome.lossChance}<small> 예시</small></strong></div><div><span>위험 수준</span><strong>{plan.risk}</strong></div></div>
            <p className="gd-chart-caption">차트·범위·확률은 화면 설계를 위한 고정 예시이며, 실제 금융 모형의 예측 결과가 아니에요.</p>
          </section>

          <div className="gd-details-grid">
            <section className="gd-allocation-card" aria-labelledby="gd-allocation-title"><div className="gd-card-heading"><h2 id="gd-allocation-title">어떤 상품을, 얼마나?</h2><span className="gd-sample-badge">배분 예시</span></div><p>시나리오 안의 상품과 배분 비중을 확인해요.</p>
              <div className="gd-allocation-bar" role="img" aria-label={plan.products.map((product) => `${product.name} ${product.ratio}%`).join(', ')}>{plan.products.map((product, i) => <span key={product.name} style={{ width: `${product.ratio}%`, background: PRODUCT_COLORS[i] }} />)}</div>
              <ul className="gd-products">{plan.products.map((product, i) => <li key={product.name}><span className="gd-product-mark" style={{ background: PRODUCT_COLORS[i] }} /><span>{product.name}<small>{product.kind}</small></span><strong className="num">{product.ratio}<small>%</small></strong></li>)}</ul>
            </section>
            <section className="gd-explanation-card" aria-labelledby="gd-explanation-title"><span className="gd-explanation-icon"><MarkIcon kind="spark" size={27} /></span><div className="gd-eyebrow">시나리오 해설 · 예시</div><h2 id="gd-explanation-title">{selected === profile ? '지금 고른 성향에서' : '다른 조합도 함께'}<br />이렇게 살펴보세요.</h2><p>{plan.description}</p><div className="gd-explanation-point"><MarkIcon kind="check" size={17} /><span>달성 확률이 가장 높다고, 내게 가장 좋은 조합인 것은 아니에요.</span></div><div className="gd-explanation-point"><MarkIcon kind="check" size={17} /><span>목표 기한과 손실을 견딜 수 있는 범위를 함께 생각해 보세요.</span></div></section>
          </div>

          {sample.alternatives && <section className="gd-alternatives"><div><span className="gd-eyebrow">목표를 포기하기 전에</span><h2>위험을 늘리는 대신, 조건을 바꿔 볼까요?</h2></div><div>{sample.alternatives.map((text, i) => <span key={text}><b>0{i + 1}</b>{text}</span>)}</div><button className="gd-text-button" onClick={() => { setDraftId('home'); document.getElementById('gd-case')?.focus(); }}>다른 목표 예시 선택하기 <MarkIcon kind="arrow" size={16} /></button></section>}

          <details className="gd-assumptions"><summary>예시 결과와 계산 가정 안내</summary><div><p>이 화면은 신규 AI 목표 달성 기능의 시연 화면이에요. 수익률·자산 경로·위험 수준·확률은 검증된 계산이나 실제 AI 호출 없이 준비한 예시이며, 실제 투자 판단의 근거로 사용할 수 없어요.</p><p>상품명은 조합을 설명하기 위한 예시이며 현재 가입·거래 가능 여부와 조건을 확인한 목록이 아니에요. 일반 정기적금은 특정 은행의 실제 상품명이 아니에요. 금리·세금·비용·배당·환율·리밸런싱을 반영한 실제 계산은 제공하지 않아요.</p><p>화면의 선택은 이 탭의 메모리에만 남고 저장·외부 전송되지 않아요. 성향 퀴즈 결과를 읽거나 변경하지 않아요. 새로고침하면 균형형과 기본 예시로 돌아가요.</p></div></details>
          <div className="gd-footer-note"><MarkIcon kind="shield" size={18} /><p>모든 투자에는 원금 손실 가능성이 있어요. 실제 서비스에서는 자료 기준일·계산 가정·위험을 함께 제공할 예정이에요.</p></div>
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{announced}</span>
    </div>
  </div>;
}
