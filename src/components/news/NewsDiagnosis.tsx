// 30초 진단: [맞춤 판별 | 빠른 검색] 두 가지 방식. 고른 값은 이 화면(메모리)에만 있고 저장·전송하지 않는다.
// 맞춤 판별은 나이·지역·취업·소득/혼인·학력/특화를 5단계로 받아 소식과 맞춰 보고, 빠른 검색은 조건 없이 소식을 하나씩 무작위로 뽑는다.
import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { NewsConditionsBox } from './NewsConditions';
import { NEWS_CATEGORIES, REGIONS, type NewsCategory, type RegionName, type YouthNews } from '@/data/news';
import {
  AGE_RANGE,
  diagnose,
  EMPLOY_OPTIONS,
  EMPTY_PROFILE,
  JOB_DETAILS,
  MAJOR_OPTIONS,
  MARITAL_OPTIONS,
  SCHOOL_OPTIONS,
  SPECIAL_OPTIONS,
  validAge,
  type DiagnoseProfile,
  type Diagnosed,
  type IncomeKind,
} from '@/lib/newsDiagnose';
import '@/styles/compare.css'; // .cf-pgroup/.cf-opt(예적금 화면의 종류 버튼)을 같이 쓴다
import { selectNews, DEFAULT_FILTER, type NewsSort } from '@/lib/newsList';

const STEPS = ['나이', '지역', '취업 상태', '소득·혼인', '학력·특화'] as const;
const TITLES = [
  '나이를 입력하세요',
  '거주 지역을 선택하세요',
  '취업 상태와 세부 상태를 선택하세요',
  '가구원·소득·혼인을 입력하세요',
  '관심 분야와 학력·전공·특화를 선택하세요',
];
const SORTS: { id: NewsSort; label: string }[] = [
  { id: 'deadline', label: '마감 임박순' },
  { id: 'new', label: '새로운 순' },
];

export type FinderTab = 'COND' | 'MATCH' | 'QUICK';
const TABS: { id: FinderTab; label: string }[] = [
  { id: 'COND', label: '조건으로 찾기' },
  { id: 'MATCH', label: '맞춤 판별' },
  { id: 'QUICK', label: '빠른 검색' },
];

type Props = { items: YouthNews[]; today: string; renderCard: (n: YouthNews) => ReactNode };
type FinderProps = Props & { tab: FinderTab; onTab: (t: FinderTab) => void; conditions: ComponentProps<typeof NewsConditionsBox> };

const toNum = (s: string) => (s.trim() === '' ? null : Number(s));

/** 조건으로 찾기·맞춤 판별·빠른 검색을 한 상자에 묶는다. 위 탭(상품 종류 탭과 같은 모양)을 누르면 흰 알약이 그쪽으로 밀려가고 내용이 그 방향에서 들어온다 */
export function NewsFinder({ items, today, renderCard, tab, onTab, conditions }: FinderProps) {
  const index = TABS.findIndex((t) => t.id === tab);
  const prev = useRef(index);
  const dir = index === prev.current ? 'none' : index > prev.current ? 'right' : 'left';
  useEffect(() => {
    prev.current = index;
  }, [index]);
  return (
    <section id="news-conditions" className="news-cond news-finder" aria-label="소식 찾는 방법">
      <div className="pt-tabs news-finder-tabs" role="group" aria-label="찾는 방법" style={{ '--idx': index } as CSSProperties}>
        <span className="news-finder-pill" aria-hidden="true" />
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-pressed={tab === t.id} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div key={tab} className="news-finder-panel" data-dir={dir}>
        {tab === 'COND' && <NewsConditionsBox {...conditions} />}
        {tab === 'MATCH' && <NewsDiagnosis items={items} today={today} renderCard={renderCard} />}
        {tab === 'QUICK' && <QuickSearch items={items} today={today} renderCard={renderCard} onMatch={() => onTab('MATCH')} />}
      </div>
    </section>
  );
}

function QuickSearch({ items, today, renderCard, onMatch }: Props & { onMatch: () => void }) {
  const [picked, setPicked] = useState<YouthNews | null>(null);
  const pool = selectNews(items, DEFAULT_FILTER, today);
  const draw = () => {
    // 직전에 뽑은 소식은 되도록 피한다
    const rest = pool.length > 1 ? pool.filter((n) => n.id !== picked?.id) : pool;
    setPicked(rest.length > 0 ? rest[Math.floor(Math.random() * rest.length)] : null);
  };
  return (
    <section className="news-diag" aria-labelledby="news-quick-title">
      <h2 id="news-quick-title" className="news-cond-title">
        지원금 빠른 검색
      </h2>
      <p className="meta">
        버튼 한 번이면 신청 기간이 지나지 않은 전체 소식에서 찾아 줘요. 조건 없이 무작위로 하나씩 뽑아요. 확 꽂히는 게 있으면 판별기로 자격을 확인하세요.
      </p>
      <p className="meta">아래 버튼을 누르면 검색이 시작돼요.</p>
      <div className="news-cond-act">
        <button type="button" className="btn btn-primary" onClick={draw} disabled={pool.length === 0}>
          {picked ? '다른 지원금 검색하기' : '지원금 검색하기'}
        </button>
        <button type="button" className="btn btn-line" onClick={onMatch}>
          내 조건으로 정확히 판별하기
        </button>
      </div>
      {picked ? (
        <div className="news-diag-pick" aria-live="polite">
          {renderCard(picked)}
        </div>
      ) : (
        pool.length === 0 && <p className="meta">지금 보여 드릴 소식이 없어요.</p>
      )}
    </section>
  );
}

function NewsDiagnosis({ items, today, renderCard }: Props) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<DiagnoseProfile>(EMPTY_PROFILE);
  const [done, setDone] = useState<DiagnoseProfile | null>(null);
  const [ageError, setAgeError] = useState(false);
  const set = <K extends keyof DiagnoseProfile>(k: K, v: DiagnoseProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  // 단일 선택은 같은 칩을 다시 누르면 "선택안함"으로 돌아간다
  const pick = <K extends 'region' | 'employ' | 'jobDetail' | 'marital' | 'school' | 'major' | 'topic'>(k: K, v: NonNullable<DiagnoseProfile[K]>) =>
    setP((x) => ({ ...x, [k]: x[k] === v ? null : v }));

  const next = () => {
    if (step === 0 && p.age != null && !validAge(p.age)) return setAgeError(true);
    setAgeError(false);
    setStep((s) => s + 1);
  };
  const finish = () => {
    if (p.age != null && !validAge(p.age)) {
      setStep(0);
      return setAgeError(true);
    }
    setDone(p);
  };
  const restart = () => {
    setDone(null);
    setStep(0);
  };
  const reset = () => {
    setP(EMPTY_PROFILE);
    restart();
  };

  if (done) {
    return <Result items={items} today={today} profile={done} renderCard={renderCard} onSort={(sort) => setDone({ ...done, sort })} onEdit={restart} onReset={reset} />;
  }

  return (
    <section className="news-diag" aria-labelledby="news-diag-title">
      <h2 id="news-diag-title" className="news-cond-title">
        5단계 맞춤 판별
      </h2>
      <p className="meta">
        {step + 1} / {STEPS.length} · {TITLES[step]}. 입력한 값은 저장하지 않고 서버로 보내지 않아요.
      </p>
      <div className="news-diag-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={(step + 1) * 20} aria-label="진단 진행">
        <span style={{ width: `${(step + 1) * 20}%` }} />
      </div>
      <ol className="news-diag-steps" aria-label="진행 단계">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={i <= step ? 'on' : ''}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="field">
          <label htmlFor="diag-age">올해 나이 (만 나이)</label>
          <div className="input-affix news-diag-age">
            <input
              id="diag-age"
              className="input num"
              type="number"
              inputMode="numeric"
              min={AGE_RANGE.min}
              max={AGE_RANGE.max}
              value={p.age ?? ''}
              aria-invalid={ageError}
              aria-describedby="diag-age-help"
              onChange={(e) => {
                setAgeError(false);
                set('age', toNum(e.target.value));
              }}
            />
            <span className="unit">세</span>
          </div>
          <p id="diag-age-help" className={ageError ? 'news-diag-err' : 'meta'} role={ageError ? 'alert' : undefined}>
            만 {AGE_RANGE.min}~{AGE_RANGE.max}세 범위에서 판별해요. 정책마다 나이 상한이 달라요.
          </p>
        </div>
      )}

      {step === 1 && (
        <Group label="사는 곳">
          {REGIONS.map((r: RegionName) => (
            <Chip key={r} on={p.region === r} onClick={() => pick('region', r)}>
              {r}
            </Chip>
          ))}
        </Group>
      )}

      {step === 2 && (
        <>
          <Group label="지금 상태">
            {EMPLOY_OPTIONS.map((o) => (
              <Chip key={o.id} on={p.employ === o.id} onClick={() => pick('employ', o.id)}>
                {o.label}
              </Chip>
            ))}
          </Group>
          <Group label="세부 상태 (선택)">
            {JOB_DETAILS.map((o) => (
              <Chip key={o} on={p.jobDetail === o} onClick={() => pick('jobDetail', o)}>
                {o}
              </Chip>
            ))}
          </Group>
          <p className="meta">고르지 않으면 넓게 보여 드려요.</p>
        </>
      )}

      {step === 3 && (
        <>
          <div className="field">
            <label htmlFor="diag-household">같이 사는 가구원 수 (본인 포함)</label>
            <div className="input-affix news-diag-age">
              <input id="diag-household" className="input num" type="number" inputMode="numeric" min={1} max={10} value={p.household ?? ''} onChange={(e) => set('household', toNum(e.target.value))} />
              <span className="unit">명</span>
            </div>
          </div>
          <Group label="내 소득 (세전)">
            {(
              [
                ['YEAR', '연봉'],
                ['MONTH', '월급'],
                ['UNKNOWN', '모름'],
              ] as [IncomeKind, string][]
            ).map(([id, label]) => (
              <Chip key={id} on={p.incomeKind === id} onClick={() => set('incomeKind', id)}>
                {label}
              </Chip>
            ))}
          </Group>
          {p.incomeKind !== 'UNKNOWN' && (
            <div className="field">
              <label htmlFor="diag-income">{p.incomeKind === 'YEAR' ? '연봉' : '월급'}</label>
              <div className="input-affix news-diag-age">
                <input id="diag-income" className="input num" type="number" inputMode="numeric" min={0} value={p.income ?? ''} onChange={(e) => set('income', toNum(e.target.value))} />
                <span className="unit">만 원</span>
              </div>
            </div>
          )}
          <p className="meta">소득 기준이 있는 소식은 금액을 따지지 않고 “추가 확인”으로 나눠 드려요. 모르면 넘어가세요.</p>
          <Group label="혼인 여부 (선택)">
            {MARITAL_OPTIONS.map((o) => (
              <Chip key={o} on={p.marital === o} onClick={() => pick('marital', o)}>
                {o}
              </Chip>
            ))}
          </Group>
        </>
      )}

      {step === 4 && (
        <>
          <Group label="관심 분야">
            <Chip on={p.topic === null} onClick={() => set('topic', null)}>
              전체
            </Chip>
            {NEWS_CATEGORIES.map((t) => (
              <Chip key={t.id} on={p.topic === t.id} onClick={() => pick('topic', t.id as NewsCategory)}>
                {t.label}
              </Chip>
            ))}
          </Group>
          <Group label="학력 (선택)">
            {SCHOOL_OPTIONS.map((o) => (
              <Chip key={o} on={p.school === o} onClick={() => pick('school', o)}>
                {o}
              </Chip>
            ))}
          </Group>
          <Group label="전공 (선택)">
            {MAJOR_OPTIONS.map((o) => (
              <Chip key={o} on={p.major === o} onClick={() => pick('major', o)}>
                {o}
              </Chip>
            ))}
          </Group>
          <Group label="특화 조건 (해당되는 것 모두)">
            {SPECIAL_OPTIONS.map((o) => (
              <Chip key={o} on={p.special.includes(o)} onClick={() => set('special', p.special.includes(o) ? p.special.filter((x) => x !== o) : [...p.special, o])}>
                {o}
              </Chip>
            ))}
          </Group>
          <div className="field">
            <label htmlFor="diag-keyword">키워드 (선택)</label>
            <input id="diag-keyword" className="input" type="search" placeholder="월세, 교통비…" value={p.keyword} onChange={(e) => set('keyword', e.target.value)} />
          </div>
        </>
      )}

      <div className="news-cond-act">
        <button type="button" className="btn btn-line" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          이전
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={next}>
            다음 ({step + 1}/{STEPS.length})
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={finish}>
            내 조건으로 찾기
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button type="button" className="btn btn-text" onClick={finish}>
            건너뛰고 바로 결과 보기
          </button>
        )}
      </div>

      <details className="news-diag-how">
        <summary>이렇게 찾아 드려요</summary>
        <ul>
          <li>나이는 소식에 적힌 신청 가능 나이와 맞춰요. 나이 조건을 원문에서 확인하지 못한 소식은 “추가 확인”으로 나눠요.</li>
          <li>지역은 고른 시도 소식과 전국 공통 소식을 함께 봐요. 관심 분야를 고르면 그 분야 소식만 남겨요.</li>
          <li>소득 기준이 있는 소식은 금액을 따지지 않고 “추가 확인”으로 나눠요. 소득·재산 기준이나 거주 기간 같은 세부 자격은 공고문에서 꼭 확인하세요.</li>
          <li>고른 취업·혼인·학력·전공이 소식의 대상 조건과 다르면 빼고, 특화 대상(여성·장애인·군인 등) 소식은 특화를 고르지 않으면 “추가 확인”으로 나눠요. 고르지 않은 조건은 따지지 않아요. 신청 기간이 지난 소식은 빼요.</li>
        </ul>
      </details>
    </section>
  );
}

function Result({
  items,
  today,
  profile,
  renderCard,
  onSort,
  onEdit,
  onReset,
}: {
  items: YouthNews[];
  today: string;
  profile: DiagnoseProfile;
  renderCard: (n: YouthNews) => ReactNode;
  onSort: (s: NewsSort) => void;
  onEdit: () => void;
  onReset: () => void;
}) {
  const r = diagnose(items, profile, today);
  const total = r.fit.length + r.confirm.length;
  return (
    <section className="news-diag" aria-labelledby="news-diag-title">
      <h2 id="news-diag-title" className="news-cond-title">
        맞춤 판별 결과
      </h2>
      <p className="meta" aria-live="polite">
        신청 가능성이 높은 소식 <b className="num">{r.fit.length}</b>개 · 추가 확인이 필요한 소식 <b className="num">{r.confirm.length}</b>개
      </p>
      <div className="news-diag-tools">
        <div className="news-sort" role="group" aria-label="진단 결과 정렬">
          {SORTS.map((s) => (
            <button key={s.id} type="button" aria-pressed={profile.sort === s.id} onClick={() => onSort(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-line btn-sm" onClick={onEdit}>
          조건 다시 고르기
        </button>
        <button type="button" className="btn btn-text" onClick={onReset}>
          처음부터
        </button>
      </div>
      <p className="meta">소득은 금액으로 따지지 않고, 소득 기준이 있는 소식은 추가 확인으로 나눴어요. 신청 전에 공고문에서 꼭 확인하세요.</p>
      {total === 0 ? (
        <div className="empty-box news-empty">
          <h3>맞는 소식이 없어요</h3>
          <p className="sub">나이나 지역, 분야를 바꿔 보세요.</p>
        </div>
      ) : (
        <>
          <Bucket title="신청 가능성이 높아요" list={r.fit} renderCard={renderCard} />
          <Bucket title="추가 확인이 필요해요" list={r.confirm} renderCard={renderCard} />
        </>
      )}
      <p className="meta">판별 결과는 참고용이에요. 실제 수급 여부는 각 기관의 심사로 정해져요. 입력한 조건은 저장하지 않아요.</p>
    </section>
  );
}

function Bucket({ title, list, renderCard }: { title: string; list: Diagnosed[]; renderCard: (n: YouthNews) => ReactNode }) {
  if (list.length === 0) return null;
  return (
    <div className="news-diag-bucket">
      <h3>
        {title} <span className="num meta">{list.length}</span>
      </h3>
      <div className="news-grid news-list">
        {list.map(({ n, checks }) => (
          <div key={n.id} className="news-diag-item">
            {renderCard(n)}
            {checks.length > 0 && <p className="news-diag-checks">{checks.join(' · ')}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="news-cond-group news-diag-group">
      <p className="news-cond-k">{label}</p>
      <div className="news-cond-chips" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}
