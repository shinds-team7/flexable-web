// 분산 투자(시안, 액티브). 지금 주식을 가진 사람이 쓰는 점검 도구로, 과거 기록으로 배우는 투자 시뮬레이션(/invest)과는 별개 기능이다.
// 가진 종목을 고르면 원 위에서 그 반대편(같이 덜 움직인 쪽)을 보여 주고, 칸을 누르면 그 칸의 종목·상품을 나열한다.
// 기준은 섹터 분산(기본) · 자산 분산 · 대체자산 분산. 배치·목록은 diversifySample의 고정 예시이고, 고른 종목은 저장하지 않는다.
// 순위·추천·매수 버튼은 두지 않는다. 목록 순서는 기준(시가총액 순 등)을 늘 함께 적는다(01 §7 R1·R2).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice, ProtoNote } from '@/components/Proto';
import { HELD_IN, HOLDABLE, MODES, closeness, type DivMode } from '@/data/diversifySample';

const MODE_KEYS: DivMode[] = ['sector', 'asset', 'alt'];
const R = 40; // 원 반지름(컨테이너 대비 %)

const pos = (i: number, n: number, r = R) => {
  const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
};
const circDist = (a: number, b: number, n: number) => Math.min(Math.abs(a - b), n - Math.abs(a - b));

export default function Diversify() {
  const [mode, setMode] = useState<DivMode>('sector');
  const [held, setHeld] = useState<string[]>(['삼성전자']);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const info = MODES[mode];
  const cats = info.categories;
  const n = cats.length;

  const heldIdx = useMemo(() => {
    const ids = mode === 'sector' ? HOLDABLE.filter((h) => held.includes(h.name)).map((h) => h.sector) : held.length ? [HELD_IN[mode]] : [];
    return cats.map((c, i) => (ids.includes(c.id) ? i : -1)).filter((i) => i >= 0);
  }, [mode, held, cats]);

  const dist = cats.map((_, i) => (heldIdx.length ? Math.min(...heldIdx.map((h) => circDist(i, h, n))) : null));
  const far = cats
    .map((c, i) => ({ c, i, d: dist[i] ?? -1 }))
    .filter((x) => x.d > 0)
    .sort((a, b) => b.d - a.d || a.i - b.i)
    .slice(0, 3);
  // 가장 멀리 떨어진 칸과 같은 거리인 칸만 '멀리 있는 칸'으로 표시한다(최대 3개).
  const farthest = far.length ? far[0].d : 0;
  const farIds = new Set(far.filter((f) => f.d === farthest).map((f) => f.c.id));
  const selId = picked && cats.some((c) => c.id === picked) ? picked : far[0]?.c.id ?? cats[0].id;
  const selIdx = cats.findIndex((c) => c.id === selId);
  const sel = cats[selIdx];
  const selClose = dist[selIdx] === null ? null : closeness(dist[selIdx] as number, farthest);

  const candidates = q.trim() ? HOLDABLE.filter((h) => h.name.toLowerCase().includes(q.trim().toLowerCase()) && !held.includes(h.name)).slice(0, 8) : [];
  const add = (name: string) => {
    setHeld((v) => (v.includes(name) ? v : [...v, name]));
    setQ('');
    setPicked(null);
  };
  const remove = (name: string) => {
    setHeld((v) => v.filter((x) => x !== name));
    setPicked(null);
  };

  return (
    <section>
      <div className="page col">
        <ProtoNote />
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="page-title">분산 투자</h1>
            <p className="page-desc">가진 종목을 고르면, 그 종목과 같이 덜 움직인 쪽을 원 위의 반대편에서 찾아봐요.</p>
          </div>
          <div className="seg" role="group" aria-label="분산 기준">
            {MODE_KEYS.map((m) => (
              <button
                key={m}
                aria-pressed={m === mode}
                onClick={() => {
                  setMode(m);
                  setPicked(null);
                }}
              >
                {MODES[m].label}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head" style={{ marginBottom: 8 }}>
            <h2>내가 가진 종목</h2>
            <span className="meta">직접 골라 주세요. 계좌를 읽어 오지 않고, 고른 종목은 저장하지 않아요.</span>
          </div>
          <div className="toolbar">
            {held.map((h) => (
              <span key={h} className="chip tm-chip">
                {h}
                <button className="tm-chip-x" aria-label={`${h} 빼기`} onClick={() => remove(h)}>
                  ×
                </button>
              </span>
            ))}
            <div className="dv-search">
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목 이름으로 찾기 (예: 현대차)" aria-label="가진 종목 찾기" />
              {candidates.length > 0 && (
                <ul className="dv-suggest" role="listbox" aria-label="찾은 종목">
                  {candidates.map((c) => (
                    <li key={c.name}>
                      <button role="option" aria-selected="false" onClick={() => add(c.name)}>
                        {c.name}
                        <span className="meta">{MODES.sector.categories.find((k) => k.id === c.sector)?.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="dv-grid">
          <div className="card">
            <div className="card-head">
              <h2>{info.label} 지도</h2>
              <span className="tag-ex">예시</span>
            </div>
            <p className="sub">{info.desc}</p>
            <div className="dv-wheel" role="group" aria-label={`${info.label} 지도. 이웃한 칸일수록 같이 많이 움직였고, 반대편일수록 덜 움직였어요.`}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={R} className="dv-ring" />
                {heldIdx.map((h) => {
                  const a = pos(h, n);
                  const b = pos(h + n / 2, n);
                  return <line key={h} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dv-axis" />;
                })}
              </svg>
              <div className="dv-center">
                <b>반대편일수록</b>
                <span>같이 덜 움직였어요</span>
              </div>
              {cats.map((c, i) => {
                const p = pos(i, n);
                const isHeld = heldIdx.includes(i);
                const cls = ['dv-node', isHeld ? 'held' : '', farIds.has(c.id) ? 'far' : '', c.id === selId ? 'sel' : ''].join(' ');
                return (
                  <button key={c.id} className={cls} style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-pressed={c.id === selId} onClick={() => setPicked(c.id)}>
                    {c.name}
                    {isHeld && <small>내 종목</small>}
                  </button>
                );
              })}
            </div>
            <div className="legend dv-legend">
              <span>
                <i className="dv-key held" />
                내 종목이 있는 칸
              </span>
              <span>
                <i className="dv-key far" />
                멀리 있는 칸
              </span>
              <span>
                <i className="dv-key axis" />
                정반대 방향
              </span>
            </div>
            {far.length > 0 ? (
              <div className="toolbar" style={{ marginTop: 12 }}>
                <span className="meta">내 종목과 멀리 있는 쪽</span>
                {far.map((f) => (
                  <button key={f.c.id} className="chip" aria-pressed={f.c.id === selId} onClick={() => setPicked(f.c.id)}>
                    {f.c.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="meta" style={{ marginTop: 12 }}>
                가진 종목을 고르면 멀리 있는 칸을 표시해 드려요.
              </p>
            )}
          </div>

          <div className="card dv-detail">
            <div className="card-head" style={{ marginBottom: 4 }}>
              <h2>{sel.name}</h2>
              {selClose && <span className={'tag dv-close l' + selClose.level}>{selClose.label}</span>}
            </div>
            <p className="sub">{sel.desc}</p>
            <div className="table-wrap">
              <table>
                <caption>
                  {info.listBasis} · <span className="tag-ex">예시</span>
                </caption>
                <thead>
                  <tr>
                    <th className="r">#</th>
                    <th>{mode === 'sector' ? '종목' : '상품'}</th>
                    <th>참고</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.items.map((it, k) => (
                    <tr key={it.name} className={held.includes(it.name) ? 'sel' : ''}>
                      <td className="r num">{k + 1}</td>
                      <td>
                        <b>{it.name}</b>
                      </td>
                      <td className="meta">{held.includes(it.name) ? '가진 종목' : it.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mode !== 'sector' && (
              <div className="toolbar" style={{ marginTop: 16 }}>
                <Link className="btn btn-line btn-sm" to="/passive/accounts">
                  계좌 알아보기
                </Link>
              </div>
            )}
          </div>
        </div>

        <Notice text="업종·자산을 나눈 예시예요. 같이 덜 움직였다는 건 지난 기록이고 앞으로도 그렇다는 뜻이 아니에요. 목록은 정해진 기준으로 나열한 것이며 특정 종목을 사라는 뜻이 아니에요." />
      </div>
    </section>
  );
}
