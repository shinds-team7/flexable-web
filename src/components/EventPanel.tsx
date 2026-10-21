// 투자 시뮬레이션의 사건 목록·상세(와이어프레임 "레일: 사건"을 옮김). 핀을 누르거나 목록에서 고르면 상세를 보여 준다.
// 수치는 모두 서버 값이고(03 C-9·C-10) 여기서는 문장으로만 바꾼다. "무슨 일"은 서버 문장(설명 전에는 수치로 만든 사실 문장)을 그대로 쓴다.
import { useState } from 'react';
import { useEventDetail, type SimEvent } from '@/data/market';
import { errorText } from '@/lib/api';
import { arrow, pctTxt, signWon, won } from '@/lib/format';

const dot = (iso: string) => iso.replaceAll('-', '.');
/** 2025.04.07 – 04.11, 하루면 2025.04.07 */
export const eventPeriod = (e: Pick<SimEvent, 'startDate' | 'endDate'>) =>
  e.startDate === e.endDate ? dot(e.startDate) : `${dot(e.startDate)} – ${(e.startDate.slice(0, 4) === e.endDate.slice(0, 4) ? e.endDate.slice(5) : e.endDate).replaceAll('-', '.')}`;
const updown = (x: number) => (x >= 0 ? 'up' : 'down');
const moveTxt = (x: number) => `${arrow(x)} ${pctTxt(x)}`;

type Props = {
  /** 차트에 보이는 기간의 사건, 시작일 순 */
  events: SimEvent[];
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
      <div className="ev-money">
        <span className="meta" style={{ display: 'block' }}>
          이때 내 돈{sel.scope === 'MARKET' ? '(고른 종목 전체)' : ''}
        </span>
        {sel.valueBefore != null && sel.valueAfter != null && sel.valueChange != null ? (
          <>
            <span className="num">{won(sel.valueBefore)}원 → </span>
            <b className="num">{won(sel.valueAfter)}원</b>
            <span className={'num ' + updown(sel.valueChange)} style={{ fontWeight: 700 }}>
              {' '}
              ({signWon(sel.valueChange)})
            </span>
            {!!sel.contributionInWindow && <span className="meta" style={{ display: 'block' }}>그사이 넣은 {won(sel.contributionInWindow)}원은 빼고 셌어요</span>}
          </>
        ) : (
          <span>이때는 아직 넣기 전이에요.</span>
        )}
      </div>
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

/** 상세 API로 받는 부분: 무슨 일·시장 반응·그 뒤에는·근거·고지 */
function Detail({ ev }: { ev: SimEvent }) {
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
        <p>시장 전체 움직임이라 특정 회사 공시는 붙이지 않았어요. 그때 뉴스는 아래 검색에서 볼 수 있어요.</p>
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
      <p className="meta" style={{ marginTop: 6 }}>
        {d.scope === 'STOCK' ? '공시: 금융감독원 OpenDART · ' : ''}
        <a href={d.newsSearchUrl} target="_blank" rel="noopener noreferrer">
          그때 뉴스 검색 ↗
        </a>
      </p>

      <div className="disclaimer" style={{ marginTop: 16 }}>
        <span aria-hidden="true">ⓘ</span>
        <span>고지: {d.notice}</span>
      </div>
    </>
  );
}
