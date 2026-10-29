// 투자 인사이트의 사건 목록·상세(와이어프레임 "레일: 사건"을 옮김). 핀을 누르거나 목록에서 고르면 상세를 보여 준다.
// 금액 계산은 투자 시뮬레이션(/simulation)이 맡아 이 패널에는 "이때 내 돈" 같은 금액 칸이 없다(decisions/2026-10-26-invest-insight-redesign ②).
// 수치는 모두 서버 값이고(03 C-9·C-10) 여기서는 문장으로만 바꾼다. "무슨 일"은 서버의 수치 사실 문장을 그대로 쓴다.
// 상세 순서: AI 개요(있을 때만) → 사실 카드(무슨 일·시장 반응·그 뒤에는·근거) → 그때 뉴스(가로 카드) → 고지(decisions/2026-10-29-event-ai-summary).
import { useState, type FocusEvent } from 'react';
import { Icon } from '@/components/Icons';
import { useEventDetail, useEventNews, type EventDetail, type SimEvent } from '@/data/market';
import { errorText } from '@/lib/api';
import { arrow, pctTxt } from '@/lib/format';

const dot = (iso: string) => iso.replaceAll('-', '.');
/** 2025.04.07 – 04.11, 하루면 2025.04.07 */
export const eventPeriod = (e: Pick<SimEvent, 'startDate' | 'endDate'>) =>
  e.startDate === e.endDate ? dot(e.startDate) : `${dot(e.startDate)} – ${(e.startDate.slice(0, 4) === e.endDate.slice(0, 4) ? e.endDate.slice(5) : e.endDate).replaceAll('-', '.')}`;
const updown = (x: number) => (x >= 0 ? 'up' : 'down');
const moveTxt = (x: number) => `${arrow(x)} ${pctTxt(x)}`;

/** 패널이 받는 사건(금액 필드 없음) */
export type PanelEvent = Omit<SimEvent, 'valueBefore' | 'valueAfter' | 'contributionInWindow' | 'valueChange' | 'noticeKey'>;

type Props = {
  /** 차트에 보이는 기간의 사건, 시작일 순 */
  events: PanelEvent[];
  /** 종목 코드 → 이름 */
  names: Record<string, string>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** 묶음 핀에서 고른 사건들. 있으면 목록을 이 사건들로 좁혀 펼친다 */
  focusIds?: number[] | null;
  onClearFocus?: () => void;
};

export function EventPanel({ events: all, names, selectedId, onSelect, focusIds, onClearFocus }: Props) {
  // 목록은 접어 두고 [목록 보기]로 연다. 핀을 누르면 목록 없이 바로 상세가 열린다
  const [open, setOpen] = useState(false);
  const picked = focusIds?.length ? all.filter((e) => focusIds.includes(e.id)) : [];
  // 기간을 바꿔 고른 사건이 화면 밖으로 나가면 전체 목록으로 돌아간다
  const focused = picked.length ? picked : null;
  const events = focused ?? all;
  const k = events.findIndex((e) => e.id === selectedId);
  const sel = k >= 0 ? events[k] : null;

  if (!sel) {
    if (events.length === 0) return null;
    const listOpen = open || !!focused;
    return (
      <section className="ev-panel" aria-label="사건 목록">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          {focused ? (
            <span className="sub" style={{ fontSize: 14 }}>
              묶음 핀의 사건 <b className="num">{focused.length}</b>개예요 · 골라서 자세히 보세요
            </span>
          ) : (
            <span className="sub" style={{ fontSize: 14 }}>
              크게 오르내린 때 <b className="num">{events.length}</b>개 · 핀을 누르면 그때 나온 공시를 볼 수 있어요
            </span>
          )}
          {focused ? (
            <button type="button" className="btn btn-line btn-sm" onClick={() => onClearFocus?.()}>
              전체 사건 보기
            </button>
          ) : (
            <button type="button" className="btn btn-line btn-sm" aria-expanded={open} aria-controls="evList" onClick={() => setOpen(!open)}>
              {open ? '목록 닫기' : '사건 목록 보기'}
            </button>
          )}
        </div>
        {listOpen && (
          <ul className="ev-list ev-list-scroll" id="evList" style={{ marginTop: 8 }}>
            {events.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onSelect(e.id)}>
                  <span className={'ev-ic ' + (e.direction === 'RISE' ? 'rise' : 'fall')} aria-hidden="true">
                    {e.direction === 'RISE' ? '▲' : '▼'}
                  </span>
                  <span>
                    <span className="ev-t" style={{ display: 'block' }}>
                      {e.headline}
                    </span>
                    <span className="ev-m num">
                      {eventPeriod(e)} · {moveTxt(e.returnRate)}
                      {e.sourceCount > 0 ? ` · 공시 ${e.sourceCount}건` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const go = (j: number) => onSelect(events[j].id);
  return (
    <section className="ev-panel ev-detail" aria-label="사건 자세히">
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <button
          className="btn-text"
          type="button"
          onClick={() => {
            setOpen(true);
            onSelect(null);
          }}
        >
          ← 목록으로
        </button>
        <span className="meta num">
          {k + 1} / {events.length}
        </span>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className={'tag ' + (sel.direction === 'RISE' ? 'up' : 'down')}>{sel.direction === 'RISE' ? '▲ 급등' : '▼ 급락'}</span>
        {sel.scope === 'MARKET' && <span className="tag">시장 전체</span>}
      </div>
      <h3 id="evTitle" tabIndex={-1}>
        {sel.headline}
      </h3>
      <p className="meta num">
        {eventPeriod(sel)} · {sel.windowDays}거래일 · {sel.scope === 'MARKET' ? '시장 전체' : (names[sel.code ?? ''] ?? sel.code)}{' '}
        <span className={updown(sel.returnRate)}>{moveTxt(sel.returnRate)}</span>
        {sel.scope === 'STOCK' && sel.marketReturn != null && (
          <>
            {' · 시장 전체 '}
            <span className={updown(sel.marketReturn)}>{moveTxt(sel.marketReturn)}</span>
          </>
        )}
      </p>
      <Detail ev={sel} />
      <div className="ev-nav">
        <button className="btn btn-line btn-sm" type="button" disabled={k <= 0} onClick={() => go(k - 1)}>
          ◀ 이전 사건
        </button>
        <button className="btn btn-line btn-sm" type="button" disabled={k >= events.length - 1} onClick={() => go(k + 1)}>
          다음 사건 ▶
        </button>
      </div>
    </section>
  );
}

/** 상세 API로 받는 부분: AI 개요 · 사실 카드(무슨 일·시장 반응·그 뒤에는·근거) · 그때 뉴스 · 고지 */
function Detail({ ev }: { ev: PanelEvent }) {
  const q = useEventDetail(ev.id);
  if (q.isPending) return <p className="sub" style={{ marginTop: 16 }}>그때 자료를 불러오는 중이에요…</p>;
  if (q.isError) {
    return (
      <div className="error-box" role="alert" style={{ marginTop: 16 }}>
        <p className="sub">{errorText(q.error)}</p>
        <button type="button" className="btn btn-line btn-sm" onClick={() => q.refetch()}>
          다시 시도
        </button>
      </div>
    );
  }
  const d = q.data;
  const r = d.marketReaction;
  const who = d.scope === 'MARKET' ? '시장 대표 지수 ETF' : d.name;
  return (
    <>
      {d.aiSummary && <AiOverview summary={d.aiSummary} />}

      {/* 확인된 사실만 담는 카드. AI 표시는 붙이지 않는다 */}
      <div className="ev-card">
        <h4>무슨 일</h4>
        <p>{d.whatHappened ?? `${who}: 이 기간 ${moveTxt(r.returnRate)}`}</p>

        <h4>시장 반응</h4>
        <div className="fact">
          <span className="tag">확인된 사실</span>
          <p className="num">
            {who}: 이 기간 <span className={updown(r.returnRate)}>{moveTxt(r.returnRate)}</span>
          </p>
        </div>
        {d.scope === 'STOCK' && r.marketReturn != null && (
          <div className="fact">
            <span className="tag">확인된 사실</span>
            <p className="num">
              같은 기간 시장 전체(코스피200 추종 ETF) <span className={updown(r.marketReturn)}>{moveTxt(r.marketReturn)}</span>
            </p>
          </div>
        )}
        {r.volumeRatio != null && (
          <div className="fact">
            <span className="tag">확인된 사실</span>
            <p className="num">거래량이 평소(직전 20거래일 중앙값)의 {r.volumeRatio.toFixed(1)}배였어요</p>
          </div>
        )}
        {r.weekReturn != null && (
          <div className="fact">
            <span className="tag">확인된 사실</span>
            <p className="num">
              마지막 날까지 5거래일 <span className={updown(r.weekReturn)}>{moveTxt(r.weekReturn)}</span>
            </p>
          </div>
        )}

        <h4>그 뒤에는</h4>
        <p className="num">
          30일 뒤 {d.afterwards.d30 == null ? '아직 30일이 지나지 않았어요' : <span className={updown(d.afterwards.d30)}>{moveTxt(d.afterwards.d30)}</span>}
          {' · '}1년 뒤 {d.afterwards.d365 == null ? '아직 1년이 지나지 않았어요' : <span className={updown(d.afterwards.d365)}>{moveTxt(d.afterwards.d365)}</span>}
        </p>
        <p className="meta">사건 마지막 날 종가 대비예요. 미래 전망이 아니에요.</p>

        <h4>근거</h4>
        {d.scope === 'MARKET' ? (
          <p>시장 전체 움직임이라 특정 회사 공시는 붙이지 않았어요.</p>
        ) : d.sources.length === 0 ? (
          <p>이 기간에 확인된 주요 공시가 없어요. 원인을 단정하기 어려워요.</p>
        ) : (
          <ul>
            {d.sources.map((s) => (
              <li key={s.externalId}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title} ↗
                </a>
                <span className="meta">
                  {' '}
                  — {s.publisher ? `${s.publisher}, ` : ''}
                  {dot(s.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {d.scope === 'STOCK' && d.sources.length > 0 && <p className="meta">이 기간에 나온 공시예요. 주가가 움직인 원인이라는 뜻은 아니에요.</p>}
        {d.scope === 'STOCK' && <p className="meta">공시: 금융감독원 OpenDART</p>}
      </div>

      <h4>그때 뉴스</h4>
      <News id={ev.id} />
      {d.newsSearchUrl && (
        <p className="meta" style={{ marginTop: 6 }}>
          <a href={d.newsSearchUrl} target="_blank" rel="noopener noreferrer">
            그때 뉴스 검색 ↗
          </a>
        </p>
      )}

      <div className="disclaimer" style={{ marginTop: 16 }}>
        <span aria-hidden="true">ⓘ</span>
        <span>고지: {d.notice}</span>
      </div>
    </>
  );
}

/**
 * AI 개요(서버가 미리 만들어 저장한 1~3문장). AI가 쓴 이 문장에만 기호 + "AI 요약"을 붙인다(기호는 읽지 않고 글자만 읽힌다).
 * 끝의 공시 문장은 AI가 아니라 서버가 공시 제목으로 붙인 것이라, 아래 설명에서 그 점을 밝힌다.
 * 예시 작성기가 쓴 문장(isSample)은 AI 표시 대신 "예시"를 붙인다.
 */
function AiOverview({ summary }: { summary: NonNullable<EventDetail['aiSummary']> }) {
  return (
    <section className="ev-ai" aria-labelledby="evAiTitle">
      <h4 id="evAiTitle">AI 개요</h4>
      <p>
        {summary.isSample ? (
          <span className="tag-ex">예시</span>
        ) : (
          <span className="ai-chip">
            <Icon id="i-ai" size={12} />
            AI 요약
          </span>
        )}{' '}
        {summary.text}
      </p>
      <p className="meta">
        {summary.isSample ? '키 없이 만든 예시 문장이에요. ' : ''}주가 움직임은 AI가 시세 자료로 썼고, 공시 문장은 공시 제목을 그대로 붙였어요. 원인을 단정하지 않아요. 숫자는 아래 확인된 사실을 기준으로 보세요.
      </p>
    </section>
  );
}

/** 2026-03-10T15:42:00+09:00 → 2026.03.10 15:42(서버가 +09:00으로 준다) */
const stamp = (iso: string) => `${dot(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

/** Tab으로 카드에 들어오면 가로 목록 안에서 그 카드가 보이게 옮긴다(움직임 줄이기면 CSS가 부드러운 스크롤을 끈다) */
const reveal = (e: FocusEvent<HTMLElement>) => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });

/**
 * 사건 무렵 기사(decisions/2026-10-28-event-news). 서버가 네이버 뉴스 검색을 그대로 중계한 제목·원문 링크·발행 시각만 보이고,
 * 출처와 "원인이 아니다" 고지를 늘 함께 둔다. 못 불러오거나 못 찾으면 아래 "그때 뉴스 검색" 링크로 안내한다.
 * 기사는 가로 카드로 넘겨 보고(좁은 화면은 스냅), 카드 전체가 원문 링크다. AI 입력·요약에 쓰지 않으므로 AI 표시가 없다.
 */
function News({ id }: { id: number }) {
  const q = useEventNews(id);
  if (q.isPending) return <p className="sub">그 무렵 기사를 찾는 중이에요…</p>;
  if (q.isError || q.data.status === 'UNAVAILABLE') {
    return <p className="sub">지금은 기사를 불러올 수 없어요. 아래 뉴스 검색에서 직접 찾아볼 수 있어요.</p>;
  }
  const n = q.data;
  return (
    <>
      {n.items.length === 0 ? (
        <p>
          {dot(n.from)}~{dot(n.to)}에 나온 기사를 찾지 못했어요. 오래된 일은 검색 결과에 잘 나오지 않아요. 아래 뉴스 검색에서 직접 찾아볼 수 있어요.
        </p>
      ) : (
        <ul className="ev-news" aria-label={`그때 뉴스 기사 ${n.items.length}건`}>
          {n.items.map((a) => (
            <li key={a.url}>
              <a className="ev-news-card" href={a.url} target="_blank" rel="noopener noreferrer" onFocus={reveal}>
                <span className="ev-news-t">{a.title}</span>
                <span className="ev-news-m">
                  <span>{a.publisher ?? '언론사 주소 없음'} ↗</span>
                  <span className="num">{stamp(a.publishedAt)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="meta">
        {n.isSample && <span className="tag-ex">예시</span>} 출처: {n.sourceName} · {dot(n.from)}~{dot(n.to)} 발행 기사. {n.notice}
      </p>
    </>
  );
}
