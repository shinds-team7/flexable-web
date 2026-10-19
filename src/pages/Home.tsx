// 홈(로그인 후). 왼쪽: 시드머니 히어로·쌓인 모양(꺾은선)·굴렸다면. 오른쪽 레일: 코스피·코스닥 → 오늘의 청년 금융 소식.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { displayName } from '@/auth/types';
import { SeedLineChart } from '@/charts/SeedLineChart';
import { DDay } from '@/components/Icons';
import { PLAY_URL } from '@/components/Layout';
import { useHomeNews, useIndices, useSeedMoney, type MarketIndices, type SeedMoney } from '@/data/home';
import { fmtMonthDay, upDown, won } from '@/lib/format';

const RANGES = [
  { r: 6, label: '6개월' },
  { r: 12, label: '1년' },
  { r: 99, label: '전체' },
];

function SeedHero({ seed }: { seed: SeedMoney }) {
  const { user } = useSession();
  const [editing, setEditing] = useState(false);
  // TODO(BE): 저장·되돌리기는 PUT·DELETE /api/v1/me/seed-money/manual(확정 15). 지금은 화면에서만 바뀐다.
  const [manual, setManual] = useState<number | null>(seed.manual);
  const [draft, setDraft] = useState(String(seed.manual ?? seed.confirmed));
  const amount = manual ?? seed.confirmed;

  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < 0) return;
    setManual(n);
    setEditing(false);
  };

  return (
    <div className="card card-hero home-hero">
      <div className="hero-main">
        <p className="sub" style={{ fontWeight: 600 }}>
          내 시드머니 {seed.isSample && <span className="tag-ex">예시</span>}
          {manual != null && <span className="tag" style={{ marginLeft: 6 }}>직접 입력</span>}
        </p>
        <div className="hero-amount">
          <p className="hero-num num">
            {won(amount)}
            <small>원</small>
          </p>
          {!editing && (
            <button type="button" className="edit-link" onClick={() => setEditing(true)}>
              수정하기
            </button>
          )}
        </div>
        {editing && (
          <form className="seed-edit" onSubmit={save}>
            <div className="field">
              <label htmlFor="seedAmount">시드머니(원)</label>
              <input id="seedAmount" className="input" type="number" min={0} step={1} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            </div>
            <button className="btn btn-primary btn-sm">저장</button>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setEditing(false)}>
              취소
            </button>
            {manual != null && (
              <button
                type="button"
                className="btn btn-line btn-sm"
                onClick={() => {
                  setManual(null);
                  setDraft(String(seed.confirmed));
                  setEditing(false);
                }}
              >
                기록 기준으로 되돌리기
              </button>
            )}
          </form>
        )}
        <p>
          이번 주기 남기는 중 <b className="num">{won(seed.current)}원</b> · 확정 전
        </p>
        <p className="meta">오늘 아낀 돈 {won(seed.todaySaved)}원</p>
        <p className="meta" style={{ marginTop: 6 }}>
          앱에 입력한 기록 기준 · {fmtMonthDay(seed.asOf)} · 최근 정산 주기마다 평균 {won(seed.avgPerCycle)}원씩 남겼어요
        </p>
      </div>
      <figure className="profile">
        <img src="/characters/lv3-3.png" alt="" />
        <figcaption>{displayName(user)}</figcaption>
      </figure>
    </div>
  );
}

function SeedHistory({ seed }: { seed: SeedMoney }) {
  const [range, setRange] = useState(99);
  const data = seed.history.slice(-Math.min(range, seed.history.length));
  const first = data[0]?.month.split('-').map(Number);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>시드머니가 쌓인 모양</h2>
          {first && (
            <p className="meta">
              {first[0]}년 {first[1]}월부터 · 정산 주기마다 쌓인 돈{seed.isSample && ' · 예시'}
            </p>
          )}
        </div>
        <div className="seg" role="group" aria-label="기간">
          {RANGES.map((o) => (
            <button key={o.r} aria-pressed={range === o.r} onClick={() => setRange(o.r)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <SeedLineChart data={data} />
    </div>
  );
}

function WhatIf({ seed }: { seed: SeedMoney }) {
  // TODO(BE): 서버 계산 결과로 바꾼다(클라이언트 재계산 금지, ADR-3). 아래는 예시 값.
  const base = seed.manual ?? seed.confirmed;
  const rows = [
    { to: '/invest', lbl: '예시 대표지수 ETF', val: Math.floor(base * 1.098), dl: '▲ 9.8%', more: '타임머신 열기' },
    { to: '/savings', lbl: '은행 평균 적금(한국은행)', val: Math.floor(base * 1.032), dl: '▲ 3.2%', more: '적금 비교 열기' },
    { to: '/mix', lbl: '이자 없이 모아 둔 경우(0%)', val: base, dl: '0%', more: '섞어서 비교하기' },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>이 돈을 굴렸다면?</h2>
          <p className="meta">1년 전 오늘, {won(base)}원을 한 번에 넣었다고 같은 조건으로 계산했어요{seed.isSample && ' · 예시'}</p>
        </div>
      </div>
      <div className="stats">
        {rows.map((r) => (
          <Link key={r.to} className="stat" to={r.to} style={{ color: 'inherit' }}>
            <span className="lbl">{r.lbl}</span>
            <p className="val num">{won(r.val)}원</p>
            <span className={'dl ' + (r.val > base ? 'up' : 'flat')}>{r.dl}</span>
            <p className="meta">{r.more}</p>
          </Link>
        ))}
      </div>
      <p className="meta" style={{ marginTop: 12 }}>
        과거 기준 계산이에요. 앞으로도 그렇다는 뜻은 아니에요.
      </p>
    </div>
  );
}

function MarketCard({ m }: { m: MarketIndices | undefined }) {
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <h2>오늘의 시장</h2>
        {m?.isSample && <span className="tag-ex">예시</span>}
      </div>
      {!m ? (
        <div className="market">
          <div className="skel" style={{ height: 76 }} />
          <div className="skel" style={{ height: 76 }} />
        </div>
      ) : (
        <>
          <div className="market">
            {m.items.map((i) => {
              const ud = upDown(i.change);
              return (
                <div key={i.code} className="idx">
                  <p className="nm">{i.name}</p>
                  <p className="val num">{i.value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className={'chg num ' + ud}>
                    {ud === 'up' ? '▲' : ud === 'down' ? '▼' : ''} {Math.abs(i.change).toFixed(2)} ({(Math.abs(i.changeRate) * 100).toFixed(2)}%)
                  </p>
                </div>
              );
            })}
          </div>
          <p className="meta" style={{ marginTop: 10 }}>
            {fmtMonthDay(m.asOf)} 종가 기준 · 출처 {m.source}
          </p>
        </>
      )}
    </div>
  );
}

function HomeNews() {
  const { data } = useHomeNews();
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <h2>오늘의 청년 금융 소식</h2>
        <Link to="/news" style={{ fontSize: 14, fontWeight: 600 }}>
          전체 보기
        </Link>
      </div>
      <div className="col" style={{ gap: 12 }}>
        {(data ?? []).map((n) => (
          <Link key={n.id} to={`/news/${n.id}`} className="card-sunken" style={{ display: 'block', color: 'inherit' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <DDay d={n.dday} />
              <span className="tag">{n.cat}</span>
            </div>
            <p style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.45 }}>{n.title}</p>
            <p className="meta">{n.save}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const seed = useSeedMoney();
  const indices = useIndices();
  return (
    <section>
      <div className="page">
        <div className="g84">
          <div className="col">
            {seed.isPending ? (
              <>
                <div className="card card-hero" aria-busy="true" aria-label="불러오는 중">
                  <div className="skel" style={{ height: 18, width: 120 }} />
                  <div className="skel" style={{ height: 52, width: 320, marginTop: 12 }} />
                  <div className="skel" style={{ height: 14, width: 240, marginTop: 12 }} />
                </div>
                <div className="card">
                  <div className="skel" style={{ height: 18, width: 160 }} />
                  <div className="skel" style={{ height: 220, marginTop: 16 }} />
                </div>
              </>
            ) : seed.isError ? (
              <div className="error-box" role="alert">
                <h3>앱 기록을 불러오지 못했어요</h3>
                <p className="sub">굴려보기는 금액을 직접 넣어서 할 수 있어요.</p>
                <div className="toolbar">
                  <button className="btn btn-primary" onClick={() => seed.refetch()}>
                    다시 불러오기
                  </button>
                  <Link className="btn btn-line" to="/invest">
                    직접 금액으로
                  </Link>
                </div>
              </div>
            ) : seed.data.history.length === 0 && seed.data.manual == null ? (
              <div className="empty-box card-hero">
                <h3>아직 모은 돈이 없어요</h3>
                <p className="sub">앱에 수입·지출을 기록하면 정산 주기가 끝날 때마다 남긴 돈이 쌓여요. 그 전에도 금액을 직접 넣고 굴려볼 수 있어요.</p>
                <div className="toolbar">
                  <Link className="btn btn-primary" to="/invest">
                    금액을 직접 넣고 굴려보기
                  </Link>
                  <a className="btn btn-line" href={PLAY_URL} target="_blank" rel="noreferrer">
                    앱 받기
                  </a>
                </div>
              </div>
            ) : (
              <>
                <SeedHero seed={seed.data} />
                <SeedHistory seed={seed.data} />
                <WhatIf seed={seed.data} />
              </>
            )}
          </div>
          <aside className="col rail" aria-label="오늘의 시장과 소식">
            <MarketCard m={indices.data} />
            <HomeNews />
          </aside>
        </div>
      </div>
    </section>
  );
}
