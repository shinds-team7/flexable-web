// 조건으로 찾기: 지역·나이·관심 주제를 여러 개 눌러 두고 [검색하기]를 누르면 고른 것 중 하나라도 맞는 소식을 합집합으로 보여 준다.
// 고른 값은 서버로 보내지 않고 저장하지 않는다(브라우저에서만 거른다).
import type { ReactNode } from 'react';
import { AGE_PICKS, NEWS_CATEGORIES, type NewsCategory, type RegionName } from '@/data/news';
import { conditionCount, EMPTY_CONDITIONS, type NewsConditions } from '@/lib/newsList';

const REGION_ORDER: RegionName[] = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '충북', '충남', '전남', '경북', '경남', '제주', '강원', '전북'];

type Props = { value: NewsConditions; onChange: (c: NewsConditions) => void; onSearch: () => void };

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function NewsConditionsBox({ value: c, onChange, onSearch }: Props) {
  const n = conditionCount(c);
  return (
    <div className="news-cond-body">
      <p className="meta">여러 개를 눌러도 돼요. 고른 것 중 하나라도 맞는 소식을 모두 보여 드려요.</p>
      <Group id="region" label="지역">
        {REGION_ORDER.map((r) => (
          <Pick key={r} on={c.regions.includes(r)} onClick={() => onChange({ ...c, regions: toggle(c.regions, r) })}>
            {r}
          </Pick>
        ))}
      </Group>
      <Group id="age" label="나이">
        {AGE_PICKS.map((a) => (
          <Pick key={a} on={c.ages.includes(a)} onClick={() => onChange({ ...c, ages: toggle(c.ages, a) })}>
            만 {a}세
          </Pick>
        ))}
      </Group>
      <Group id="topic" label="관심 주제" className="topics">
        {NEWS_CATEGORIES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="news-topic"
            aria-pressed={c.topics.includes(t.id)}
            onClick={() => onChange({ ...c, topics: toggle(c.topics, t.id) })}
          >
            <span className="news-topic-ico" aria-hidden="true">
              <TopicIcon id={t.id} />
            </span>
            {t.label}
          </button>
        ))}
      </Group>
      <div className="news-cond-act">
        <button type="button" className="btn btn-primary" onClick={onSearch}>
          검색하기{n > 0 && <span className="num"> · {n}개 선택</span>}
        </button>
        {n > 0 && (
          <button type="button" className="btn btn-text" onClick={() => onChange(EMPTY_CONDITIONS)}>
            선택 지우기
          </button>
        )}
      </div>
    </div>
  );
}

function Group({ id, label, className = '', children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className="news-cond-group">
      <p className="news-cond-k" id={`news-cond-${id}`}>
        {label}
      </p>
      <div className={`news-cond-chips ${className}`} role="group" aria-labelledby={`news-cond-${id}`}>
        {children}
      </div>
    </div>
  );
}

function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

// 주제 아이콘(24px 격자, 선 아이콘). 색은 글자색을 따라가 선택하면 브랜드 블루가 된다.
const ICONS: Record<NewsCategory, ReactNode> = {
  TRANSPORT: (
    <>
      <rect x="5" y="3.5" width="14" height="13" rx="3" />
      <path d="M5 11h14M8.5 20l1.5-3.5M15.5 20 14 16.5" />
      <circle cx="8.5" cy="13.8" r=".6" />
      <circle cx="15.5" cy="13.8" r=".6" />
    </>
  ),
  HOUSING: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  FINANCE: (
    <>
      <ellipse cx="12" cy="13" rx="8" ry="6" />
      <path d="M8 8.2 7.5 5l3 1.6M17.5 14.2l2.5.3M10 10.5h4" />
      <circle cx="9" cy="12.5" r=".6" />
    </>
  ),
  JOB: (
    <>
      <rect x="3.5" y="8" width="17" height="11.5" rx="2" />
      <path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2M3.5 13h17M11 13v2h2v-2" />
    </>
  ),
  EDUCATION: (
    <>
      <path d="m2.5 9.5 9.5-4.5 9.5 4.5-9.5 4.5z" />
      <path d="M6.5 11.8V16c1.2 1.4 3 2.2 5.5 2.2s4.3-.8 5.5-2.2v-4.2M21.5 9.5V14" />
    </>
  ),
  CULTURE: (
    <>
      <path d="M12 3.5c-5 0-8.5 3.2-8.5 7.5 0 3.3 2.5 5 4.8 4.8 1.7-.1 1.9 1.2 1.3 2.3-.7 1.3.3 2.4 1.8 2.4 4.7 0 8.8-3.2 8.8-8.5 0-4.7-3.3-8.5-8.2-8.5z" />
      <circle cx="8" cy="10" r=".8" />
      <circle cx="12" cy="7.8" r=".8" />
      <circle cx="16" cy="10" r=".8" />
    </>
  ),
  TAX: (
    <>
      <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" />
      <path d="m9.5 13.5 5-5M9.8 9h.1M14.2 13.4h.1" />
    </>
  ),
  ETC: (
    <>
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18" cy="12" r="1.3" />
    </>
  ),
};

function TopicIcon({ id }: { id: NewsCategory }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[id]}
    </svg>
  );
}
