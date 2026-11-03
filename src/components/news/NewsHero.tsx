// 소식 화면 맨 위: 가운데 검색창 · 추천 검색어 · 조건으로 찾기로 가는 링크. 검색은 제목·요약·기관·키워드·지역에서 한다.
import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../Icons';

const SUGGESTIONS = ['청년월세', '교통비', '적금', '면접', '이사비'];

type Props = { query: string; onSearch: (q: string) => void; onGoConditions: () => void };

export function NewsHero({ query, onSearch, onGoConditions }: Props) {
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(draft);
  };
  return (
    <div className="news-hero">
      <h1 className="sr-only">청년 금융 소식</h1>
      <form className="news-hero-search" role="search" aria-label="소식 검색" onSubmit={submit}>
        <Icon id="i-search" size={18} />
        <input type="search" placeholder="청년 월세, 교통비, 저축…" aria-label="검색어" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm">
          검색
        </button>
      </form>
      <div className="news-hero-chips" role="group" aria-label="추천 검색어">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="news-pill" onClick={() => onSearch(s)}>
            {s}
          </button>
        ))}
      </div>
      <button type="button" className="news-hero-link" onClick={onGoConditions}>
        뭘 받을지 모르겠다면 조건으로 찾기 <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
