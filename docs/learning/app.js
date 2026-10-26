// 학습 가이드 화면. 내용은 content/*.js(G)에 있고, 여기는 그리기와 이동만 한다.
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const main = $('#main');
  const side = $('#side');

  // ───────── 공통 도우미 ─────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** `코드` · **굵게** · [[주소|이름]] · 줄바꿈 */
  function fmt(s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\[\[([A-Za-z0-9._~-]+)\|([^\]]+)\]\]/g, '<a href="#$1">$2</a>');
    return t.replace(/\n/g, '<br>');
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fxguide.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('fxguide.' + k, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 동작 */ } },
  };

  function refUrl(r) {
    if (r.f.startsWith('app:')) return `${G.meta.appGh}/blob/${G.meta.appCommit}/${r.f.slice(4)}${r.l ? '#L' + r.l : ''}`;
    return `${G.meta.gh}/blob/${G.meta.commit}/${r.f}${r.l ? '#L' + r.l : ''}`;
  }
  function refPath(r) { return (r.f.startsWith('app:') ? 'flexable-app/' + r.f.slice(4) : r.f) + (r.l ? ':' + r.l : ''); }
  function ref(r, label) {
    const file = r.f.split('/').pop();
    const app = r.f.startsWith('app:') ? '앱 저장소 · ' : '';
    const text = label || app + file + (r.l ? ':' + r.l : '');
    return `<span class="ref"><a href="${esc(refUrl(r))}" target="_blank" rel="noopener" title="${esc(refPath(r))}">${esc(text)}</a><button type="button" class="copy" data-copy="${esc(refPath(r))}" aria-label="${esc(refPath(r))} 경로 복사">복사</button></span>`;
  }
  const refs = (list) => (list && list.length ? `<div class="refs">${list.map((r) => ref(r)).join('')}</div>` : '');
  const ev = (list) => (list || []).map((k) => `<span class="ev ${k}" title="${esc(G.evidence[k].desc)}">${esc(G.evidence[k].label)}</span>`).join(' ');
  const lyr = (id) => `<span class="lyr" style="--c:var(--l-${id})">${esc(G.layers[id].name)}</span>`;
  const conceptChips = (ids) => (ids || []).map((id) => {
    const c = G.concepts.find((x) => x.id === id);
    return c ? `<a class="chip" href="#c-${id}">${esc(c.term)}</a>` : '';
  }).join(' ');
  const unitById = (id) => G.units.find((u) => u.id === id);
  const unitNo = (id) => G.units.findIndex((u) => u.id === id) + 1;

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.copy');
    if (!b) return;
    const text = b.dataset.copy;
    const done = () => { const o = b.textContent; b.textContent = '복사됨'; setTimeout(() => (b.textContent = o), 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  });
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { /* 선택된 상태로 둔다 */ }
    ta.remove();
  }

  // ───────── 목차 ─────────
  function renderSide(cur) {
    const done = store.get('done', {});
    const a = (href, label, extra = '') => `<a href="#${href}" ${cur === href || cur.startsWith(href + '.') ? 'aria-current="true"' : ''}>${label}${extra}</a>`;
    side.innerHTML = `<nav aria-label="목차">
      <h4>시작</h4>${a('start', '<span class="n">·</span>어디부터 보나')}
      <h4>추천 학습 순서</h4>
      ${G.units.map((u, i) => a(u.id, `<span class="n">${i + 1}</span>${esc(u.title.split(':')[0])}`, done[u.id] ? '<span class="done" aria-label="완료">✓</span>' : '')).join('')}
      <h4>도구</h4>
      ${a('map', '<span class="n">·</span>전체 구조 지도')}
      ${a('flows', '<span class="n">·</span>기능별 요청 흐름')}
      ${a('code', '<span class="n">·</span>핵심 코드 탐색')}
      ${a('db', '<span class="n">·</span>ERD와 테이블 사전')}
      ${a('concepts', '<span class="n">·</span>개념 사전')}
      ${a('quiz', '<span class="n">·</span>확인 문제 모음')}
      ${a('limits', '<span class="n">·</span>설계 선택과 한계')}
    </nav>`;
  }

  // ───────── 시작 ─────────
  function viewStart() {
    const done = store.get('done', {});
    const stateLabel = { done: ['구현', 'test'], sample: ['화면·예시만', 'infer'], plan: ['계획만', 'plan'], out: ['범위 밖', 'plan'], demo: ['시연', 'code'] };
    return `<div class="wrap">
      <div class="prose">
        <span class="eyebrow">팀 내부 학습 자료 · 실제 코드 기준</span>
        <h1>이 저장소를 처음 본다면 여기부터</h1>
        <p class="lead">텅장관리 웹은 브라우저의 React 화면, Spring Boot 웹 API, MySQL, 시세를 모으는 worker로 이뤄져 있고, 앱 서버와는 연동 API로만 닿는다. 이 가이드는 그 연결을 실제 파일과 함수로 따라가게 만든 학습 도구다.</p>
        <p>읽는 방법: 아래 순서대로 단원을 열고, 각 단원의 <strong>요청 흐름</strong>을 한 단계씩 넘기며 오른쪽 링크로 실제 코드를 같이 연다. 단원 끝 질문에 답할 수 있으면 다음으로 간다.</p>
      </div>
      <div class="box">
        <h3>기준</h3>
        <ul class="dots">
          <li><code>origin/main</code> 커밋 <a href="${G.meta.gh}/commit/${G.meta.commit}" target="_blank" rel="noopener"><code>${G.meta.commitShort}</code></a> · ${esc(G.meta.commitTitle)} · 분석일 ${G.meta.analyzedOn}</li>
          <li>앱 저장소는 웹 연동 부분(<code>weblink</code>)만 커밋 <code>${G.meta.appCommit}</code> 기준으로 봤다.</li>
          <li>${esc(G.meta.tests)}</li>
          <li>운영 서버(VM·Vercel)는 접속하지 않았다. 어느 커밋이 배포돼 있는지는 이 가이드가 말하지 않는다.</li>
        </ul>
        <div class="row">${Object.keys(G.evidence).map((k) => `<span>${ev([k])} <span class="muted" style="font-size:.82rem">${esc(G.evidence[k].desc)}</span></span>`).join('')}</div>
      </div>
      <section class="sec">
        <h2>추천 학습 순서</h2>
        <p class="muted">쉬운 조회 요청 하나로 왕복 전체를 본 뒤, 인증 → DB 쓰기 → 앱 서버 연동 → 투자 계산 → worker 순서로 넓힌다.</p>
        <ol class="order">${G.units.map((u, i) => `<li><a href="#${u.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span>${esc(u.title)}<span class="g">${esc(u.goal)}</span></span><span>${done[u.id] ? '<span class="ev test">완료</span>' : ''}</span></a></li>`).join('')}</ol>
      </section>
      <section class="sec">
        <h2>기능별 구현 상태</h2>
        <p class="muted">"화면이 있다"와 "서버까지 구현됐다"를 구분한다.</p>
        ${statusTable(stateLabel)}
      </section>
      <section class="sec">
        <h2>바로 가기</h2>
        <div class="grid2">
          <a class="card" href="#flows" style="text-decoration:none;color:inherit"><h3>요청 흐름 7개</h3><p class="muted">종목 목록 · 로그인 · 소셜 로그인 · 시드머니 저장 · 앱 연동 · 시뮬레이션 · worker</p></a>
          <a class="card" href="#db" style="text-decoration:none;color:inherit"><h3>ERD와 테이블 사전</h3><p class="muted">표 12개, 한 행의 뜻, 가상 행, JOIN 예제</p></a>
          <a class="card" href="#explain.1" style="text-decoration:none;color:inherit"><h3>설명 모드</h3><p class="muted">멘토 설명 순서로 같은 내용을 한 장씩</p></a>
        </div>
      </section>
    </div>`;
  }
  function statusTable(stateLabel) {
    return `<div class="tbl"><table><thead><tr><th>기능</th><th>상태</th><th>어디에 · 근거</th></tr></thead><tbody>
      ${G.status.map((s) => `<tr><td>${esc(s.f)}</td><td><span class="ev ${stateLabel[s.s][1]}">${stateLabel[s.s][0]}</span></td><td>${fmt(s.where)}${s.test ? `<br><span class="muted" style="font-size:.8rem">테스트: ${esc(s.test)}</span>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  // ───────── 전체 구조 지도 ─────────
  let mapSel = 'api';
  function mapSvg(sel) {
    const n = G.map.nodes;
    const edges = G.map.edges.map((e) => {
      const d = e.path || `M${e.from[0]} ${e.from[1]} L${e.to[0]} ${e.to[1]}`;
      return `<path class="edge${e.dash ? ' dash' : ''}" d="${d}" marker-end="url(#arr)"/><text class="elab" x="${e.lx}" y="${e.ly}">${esc(e.label)}</text>`;
    }).join('');
    const nodes = n.map((x) => `<g class="nodebox${x.id === sel ? ' on' : ''}" data-node="${x.id}" tabindex="0" role="button" aria-label="${esc(x.name)}" style="--c:var(--l-${x.layer})">
        <rect class="b" x="${x.x}" y="${x.y}" width="${x.w}" height="${x.h}" rx="10"/>
        <rect x="${x.x}" y="${x.y}" width="6" height="${x.h}" rx="3" fill="var(--l-${x.layer})"/>
        <text x="${x.x + 18}" y="${x.y + 26}" font-size="14" font-weight="600">${esc(x.name)}</text>
        <text class="sub" x="${x.x + 18}" y="${x.y + 46}">${esc(x.sub)}</text></g>`).join('');
    return `<div class="diag"><svg viewBox="0 0 1000 540" role="img" aria-label="전체 구조 지도">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--fg3)"/></marker></defs>
      ${edges}${nodes}</svg></div>`;
  }
  function mapDetail(id) {
    const x = G.map.nodes.find((n) => n.id === id);
    return `<div class="card" id="mapdetail"><div class="row">${lyr(x.layer)} ${ev(x.ev)}</div><h3>${esc(x.name)}</h3><p>${fmt(x.runs)}</p>
      <ul class="dots">${x.where.map((w) => `<li>${fmt(w)}</li>`).join('')}</ul>${refs(x.refs)}</div>`;
  }
  function mapBlock() {
    return `<div class="sec" id="mapblock">${mapSvg(mapSel)}${mapDetail(mapSel)}</div>`;
  }
  function bindMap(root) {
    root.querySelectorAll('[data-node]').forEach((g) => {
      const pick = () => { mapSel = g.dataset.node; const b = root.querySelector('#mapblock'); b.outerHTML = mapBlock(); bindMap(root); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
  }
  function packagesBlock() {
    const st = { code: ['코드 있음', 'code'], plan: ['README만', 'plan'], out: ['범위 밖', 'plan'] };
    return `<div class="tbl"><table><thead><tr><th>패키지</th><th>상태</th><th>하는 일</th><th>의존해도 되는 패키지</th></tr></thead><tbody>
      ${G.packages.map((p) => `<tr><td><code>${esc(p.name)}</code></td><td><span class="ev ${st[p.state][1]}">${st[p.state][0]}</span></td><td>${esc(p.role)}</td><td>${esc(p.uses)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  function viewMap() {
    return `<div class="wrap"><div class="prose"><span class="eyebrow">도구</span><h1>전체 구조 지도</h1>
      <p class="lead">칸을 누르면 그곳에서 무엇이 실행되고 어느 파일이 시작점인지 나온다. 점선은 조건부 연결이다.</p></div>
      ${mapBlock()}
      <section class="sec"><h2>레이어 색</h2><div class="row">${Object.keys(G.layers).map((k) => `<span title="${esc(G.layers[k].desc)}">${lyr(k)}</span>`).join('')}</div></section>
      <section class="sec"><h2>백엔드 패키지</h2><p class="muted">의존 방향은 <code>PackageDependencyTest.ALLOWED</code> 그대로다. 표에 없는 의존은 빌드(테스트)가 실패한다.</p>${packagesBlock()}</section>
      <p>설명은 [[u1|1단원 전체 구조]]에서 이어진다.</p>
    </div>`.replace(/\[\[([A-Za-z0-9._~-]+)\|([^\]]+)\]\]/g, '<a href="#$1">$2</a>');
  }

  // ───────── 요청 흐름 ─────────
  const DBK = { read: 'DB 읽기', write: 'DB 쓰기', none: 'DB 안 씀', mem: '서버·브라우저 메모리', browser: '브라우저 저장소' };
  function flowPicker(cur) {
    return `<nav class="flowpick" aria-label="흐름 고르기">${Object.keys(G.flows).map((k) => `<a href="#flow-${k}" ${k === cur ? 'aria-current="true"' : ''}>${esc(G.flows[k].title)}</a>`).join('')}</nav>`;
  }
  function seqDiagram(f, id, cur, compact) {
    const lanes = f.lanes;
    const hd = `<div class="hd"><div></div>${lanes.map((l) => `<div style="--c:var(--l-${l})">${esc(G.layers[l].short)}</div>`).join('')}</div>`;
    const rows = f.steps.map((s, i) => {
      const cells = lanes.map((l) => `<div class="cell">${l === s.lane ? `<span class="node" style="--c:var(--l-${l})">${esc(s.title)}</span>` : ''}</div>`).join('');
      return `<button type="button" class="st${i === cur ? ' on' : ''}" data-step="${i}" data-flow="${id}" aria-label="${i + 1}단계 ${esc(s.title)}"><span class="no">${i + 1}</span>${cells}</button>`;
    }).join('');
    return `<div class="seqwrap"${compact ? ' style="max-height:440px;overflow:auto"' : ''}><div class="seq" style="--cols:${lanes.length}">${hd}${rows}</div></div>`;
  }
  function stepDetail(f, cur) {
    const s = f.steps[cur];
    const next = f.steps[cur + 1];
    const dbs = (s.db || [{ kind: 'none' }]).map((d) => `<div><span class="dbk ${d.kind}">${DBK[d.kind]}</span> ${d.what ? fmt(d.what) : ''}</div>`).join('');
    return `<div class="detail">
      <div class="f"><span class="lab">지금 실행 중인 곳</span><div>${lyr(s.lane)}</div><div class="muted" style="font-size:.85rem">${esc(G.layers[s.lane].desc)}</div></div>
      <div class="f"><span class="lab">파일 · 함수</span>${s.refs.length ? refs(s.refs) : '<span class="muted">우리 코드 밖(공급자 화면)</span>'}</div>
      <div class="f"><span class="lab">들어오는 데이터</span><div>${fmt(s.input)}</div></div>
      <div class="f"><span class="lab">나가는 데이터</span><div>${fmt(s.output)}</div></div>
      <div class="f wide"><span class="lab">처리 내용</span><div>${fmt(s.process)}</div>${s.note ? `<div class="muted" style="font-size:.88rem">참고: ${fmt(s.note)}</div>` : ''}</div>
      <div class="f"><span class="lab">DB 읽기/쓰기 · 값이 머무는 곳</span>${dbs}</div>
      <div class="f"><span class="lab">다음 단계</span><div>${next ? `${lyr(next.lane)} ${esc(next.title)}` : '<span class="muted">흐름 끝</span>'}</div></div>
    </div>`;
  }
  function flowPlayer(id, cur, compact) {
    const f = G.flows[id];
    cur = Math.max(0, Math.min(cur, f.steps.length - 1));
    return `<div class="sec flowplayer" data-flow-id="${id}" data-cur="${cur}">
      <div class="row" style="justify-content:space-between"><div><code>${esc(f.req)}</code></div>
      <div class="stepnav"><button type="button" class="btn" data-go="-1" ${cur === 0 ? 'disabled' : ''}>← 이전</button><span class="pos">${cur + 1} / ${f.steps.length}</span><button type="button" class="btn primary" data-go="1" ${cur === f.steps.length - 1 ? 'disabled' : ''}>다음 →</button></div></div>
      ${seqDiagram(f, id, cur, compact)}
      <div class="stepbox"><h3 style="margin-bottom:10px">${cur + 1}. ${esc(f.steps[cur].title)}</h3>${stepDetail(f, cur)}</div>
    </div>`;
  }
  function bindFlows(root, onChange) {
    root.querySelectorAll('.flowplayer').forEach((p) => {
      const id = p.dataset.flowId;
      const set = (n) => {
        const fresh = document.createElement('div');
        fresh.innerHTML = flowPlayer(id, n, p.closest('.slide') != null);
        const np = fresh.firstElementChild;
        p.replaceWith(np);
        bindFlows(np.parentElement, onChange);
        if (onChange) onChange(id, +np.dataset.cur);
      };
      p.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => set(+b.dataset.step)));
      p.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => set(+p.dataset.cur + +b.dataset.go)));
    });
  }
  function viewFlows() {
    return `<div class="wrap"><div class="prose"><span class="eyebrow">도구</span><h1>기능별 요청 흐름</h1>
      <p class="lead">흐름 하나를 고르면 단계마다 지금 실행 중인 곳, 파일·함수, 들어오고 나가는 데이터, DB 읽기/쓰기를 함께 본다.</p></div>
      <div class="grid2">${Object.keys(G.flows).map((k) => { const f = G.flows[k]; return `<a class="card" href="#flow-${k}" style="text-decoration:none;color:inherit"><span class="muted" style="font-size:.78rem">${f.unit ? `${unitNo(f.unit)}단원` : ''} · ${f.steps.length}단계</span><h3>${esc(f.title)}</h3><code style="font-size:.75rem">${esc(f.req)}</code><p class="muted" style="font-size:.88rem">${esc(f.summary)}</p><div class="row">${f.lanes.map(lyr).join('')}</div></a>`; }).join('')}</div>
    </div>`;
  }
  function viewFlow(id, cur) {
    const f = G.flows[id];
    if (!f) return viewFlows();
    const u = unitById(f.unit);
    return `<div class="wrap">${flowPicker(id)}
      <div class="prose"><span class="eyebrow">요청 흐름 · ${f.steps.length}단계</span><h1>${esc(f.title)}</h1><p class="lead">${esc(f.summary)}</p>
      <p class="muted" style="font-size:.88rem">← → 키로도 넘길 수 있다. 단계 줄을 누르면 그 단계로 간다.${u ? ` 설명은 <a href="#${u.id}">${unitNo(u.id)}단원 ${esc(u.title)}</a>.` : ''}</p></div>
      ${flowPlayer(id, cur)}
    </div>`;
  }

  // ───────── 단원 ─────────
  function viewUnit(u) {
    const no = unitNo(u.id);
    const done = store.get('done', {});
    const kinds = { basic: '기초 개념', ours: '우리 코드', run: '실행 과정', more: '더 보기' };
    const secs = u.sections.map((s) => {
      let extra = '';
      if (s.map) extra += mapBlock();
      if (s.packages) extra += packagesBlock();
      if (s.flow) extra += flowPlayer(s.flow, 0) + `<p><a href="#flow-${s.flow}">이 흐름만 크게 보기 →</a></p>`;
      if (s.erd) extra += erdBlock() + tableDetail(tableSel);
      if (s.joins) extra += joinsBlock();
      if (s.design) extra += designBlock();
      return `<section class="sec"><div class="eyebrow"><span class="k ${s.kind}">${kinds[s.kind]}</span>${s.ev ? ev(s.ev) : ''}</div><h2>${esc(s.h)}</h2>
        ${s.concepts ? `<div class="row">${conceptChips(s.concepts)}</div>` : ''}
        <div class="prose">${s.body.map((p) => `<p>${fmt(p)}</p>`).join('')}</div>${refs(s.refs)}${extra}</section>`;
    }).join('');
    const nextU = u.next ? unitById(u.next) : null;
    return `<div class="wrap">
      <header class="unithead"><span class="eyebrow">${no}단원 / ${G.units.length}</span><h1>${esc(u.title)}</h1><p class="lead">${esc(u.goal)}</p></header>
      ${secs}
      <section class="endbox" aria-label="단원 정리">
        <h3><span class="k check">정리</span> 이제 설명할 수 있어야 하는 것</h3>
        <ul class="clean checks">${u.canExplain.map((c) => `<li>${fmt(c)}</li>`).join('')}</ul>
        <hr class="sep">
        <h3>직접 열어볼 코드</h3>
        <ul class="clean">${u.openCode.map((o) => `<li>${ref(o.r)} <span class="muted">— ${fmt(o.why)}</span></li>`).join('')}</ul>
        <hr class="sep">
        <h3>이해도 확인 질문</h3>
        <div class="sec">${u.quiz.map(qa).join('')}</div>
        <hr class="sep">
        <div class="row" style="justify-content:space-between">
          <label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" id="done-${u.id}" ${done[u.id] ? 'checked' : ''}> 이 단원을 다 봤다 (이 브라우저에만 저장)</label>
          ${nextU ? `<a class="btn primary" href="#${nextU.id}">다음: ${unitNo(nextU.id)}단원 ${esc(nextU.title.split(':')[0])} →</a>` : `<a class="btn primary" href="#explain.1">설명 모드로 →</a>`}
        </div>
      </section>
    </div>`;
  }
  function qa(x) {
    return `<details class="qa"><summary>${fmt(x.q)}</summary><div class="a"><p>${fmt(x.a)}</p>${x.refs && x.refs.length ? `<div><span class="muted" style="font-size:.78rem;font-weight:600">근거</span> ${refs(x.refs)}</div>` : ''}</div></details>`;
  }

  // ───────── 코드 탐색 ─────────
  let codeLayer = 'all';
  let codeQuery = '';
  function viewCode(focus) {
    const layers = ['all', 'browser', 'proxy', 'api', 'worker', 'db'];
    const q = codeQuery.toLowerCase();
    const list = G.code.filter((c) => (codeLayer === 'all' || c.layer === codeLayer) && (!q || (c.path + c.role + c.calledBy + c.calls).toLowerCase().includes(q)));
    return `<div class="wrap"><div class="prose"><span class="eyebrow">도구</span><h1>핵심 코드 탐색</h1>
      <p class="lead">먼저 읽을 파일 ${G.code.length}개. 파일마다 누가 부르고 무엇을 부르는지 적었다. 링크는 GitHub의 기준 커밋 줄로 열리고, [복사]는 IDE에서 찾을 경로(파일:줄)를 복사한다.</p></div>
      <div class="row">${layers.map((l) => `<button type="button" class="btn${l === codeLayer ? ' primary' : ''}" data-layer="${l}">${l === 'all' ? '전체' : esc(G.layers[l].short)}</button>`).join('')}
        <input id="codeq" type="search" value="${esc(codeQuery)}" placeholder="이 목록에서 찾기" aria-label="코드 목록에서 찾기" style="height:36px;border:1px solid var(--line-strong);border-radius:8px;padding:0 10px;background:var(--surface);color:var(--fg);font:inherit;flex:1 1 180px;max-width:280px"></div>
      <div class="grid2">${list.map((c) => `<article class="card" id="code-${c.id}"${focus === c.id ? ' style="border-color:var(--accent)"' : ''}>
        <div class="row">${lyr(c.layer)}</div><h3 class="mono" style="font-size:.88rem;font-weight:600;word-break:break-all">${esc(c.path)}</h3>
        <p>${fmt(c.role)}</p>
        <div class="tbl" style="border:0"><table><tbody><tr><th>누가 부르나</th><td>${esc(c.calledBy)}</td></tr><tr><th>무엇을 부르나</th><td>${esc(c.calls)}</td></tr></tbody></table></div>
        ${refs(c.keys)}</article>`).join('') || '<p class="muted">맞는 파일이 없다.</p>'}</div>
    </div>`;
  }
  function bindCode() {
    main.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => { codeLayer = b.dataset.layer; render(); }));
    const i = $('#codeq');
    if (i) i.addEventListener('input', () => { codeQuery = i.value; const pos = i.selectionStart; render(); const j = $('#codeq'); j.focus(); j.setSelectionRange(pos, pos); });
  }

  // ───────── DB ─────────
  let tableSel = 'users';
  function erdBlock() {
    const E = G.erd;
    const W = E.w;
    const h = (n) => 28 + n * 18 + 8;
    const groups = E.groups.map((g, i) => `<rect class="grp" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="12"/>
      <text class="grplab" x="${i === 3 ? g.x + g.w - 10 : g.x + 10}" y="${g.y + 16}" text-anchor="${i === 3 ? 'end' : 'start'}">${esc(g.label)}</text>`).join('');
    const boxes = Object.keys(E.boxes).map((name) => {
      const b = E.boxes[name];
      const t = G.tables.find((x) => x.name === name);
      const lines = b.cols.map((c, i) => {
        const m = c.match(/^((?:PK|FK|UQ)(?:·(?:PK|FK|UQ))*) (.*)$/);
        return `<text class="col" x="${b.x + 10}" y="${b.y + 46 + i * 18}">${m ? `<tspan class="pk">${esc(m[1])}</tspan> ${esc(m[2])}` : esc(c)}</text>`;
      }).join('');
      const layer = t.group === '앱 연동' ? 'app' : t.group === '시세' ? 'db' : t.group === '수집 기록' ? 'worker' : 'browser';
      return `<g class="nodebox${name === tableSel ? ' on' : ''}" data-table="${name}" tabindex="0" role="button" aria-label="${name} 표" style="--c:var(--l-${layer})">
        <rect class="b" x="${b.x}" y="${b.y}" width="${W}" height="${h(b.cols.length)}" rx="8"/>
        <text x="${b.x + 10}" y="${b.y + 20}" font-size="13" font-weight="700" font-family="var(--mono)">${name}</text>
        <line x1="${b.x}" x2="${b.x + W}" y1="${b.y + 28}" y2="${b.y + 28}" stroke="var(--line)"/>${lines}</g>`;
    }).join('');
    const edges = E.edges.map((e, i) => `<path class="edge" id="erd-e${i}" d="${e[3]}" marker-end="url(#arr2)"/><text class="elab erdlab" data-e="${i}" text-anchor="middle">${esc(e[2])}</text>`).join('');
    return `<div class="diag erd"><svg viewBox="0 0 1140 600" role="img" aria-label="웹 DB ERD">
      <defs><marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--fg3)"/></marker></defs>
      ${groups}${boxes}${edges}</svg></div>
      <p class="muted" style="font-size:.85rem">화살표는 자식 표(FK) → 부모 표(PK). 표기는 자식 : 부모의 개수. ${esc(G.outOfScopeTables)}</p>`;
  }
  function placeErdLabels(root) {
    root.querySelectorAll('.erdlab').forEach((t) => {
      const p = root.querySelector('#erd-e' + t.dataset.e);
      if (!p || !p.getTotalLength) return;
      try {
        const pt = p.getPointAtLength(p.getTotalLength() / 2);
        t.setAttribute('x', pt.x + 4); t.setAttribute('y', pt.y - 5);
      } catch { /* 그리기 전이면 건너뜀 */ }
    });
  }
  function sampleTable(cols, rows) {
    return `<div class="tbl"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr>${r.map((v) => v === null ? '<td class="nul">NULL</td>' : typeof v === 'number' ? `<td class="num">${v}</td>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function tableDetail(name) {
    const t = G.tables.find((x) => x.name === name);
    return `<article class="card" id="tabledetail">
      <div class="row"><span class="chip">${esc(t.group)}</span><span class="muted" style="font-size:.82rem">마이그레이션 ${esc(t.mig)}</span> ${ref(t.owner, '엔티티: ' + t.owner.f.split('/').pop())}</div>
      <h2 class="mono" style="font-size:1.2rem">${esc(t.name)}</h2>
      <div class="box"><span class="eyebrow">이 표의 한 행은</span><p style="font-size:1.05rem;font-weight:600">${fmt(t.row)}</p></div>
      <h4>열</h4>
      <div class="tbl"><table><thead><tr><th>열</th><th>타입</th><th>제약</th><th>뜻</th></tr></thead><tbody>
        ${t.cols.map((c) => `<tr><td><code>${esc(c[0])}</code></td><td class="mono" style="font-size:.78rem">${esc(c[1])}</td><td>${esc(c[2])}</td><td>${fmt(c[3])}</td></tr>`).join('')}</tbody></table></div>
      <div class="grid2"><div><h4>누가 쓰나</h4><p>${fmt(t.writers)}</p></div><div><h4>누가 읽나</h4><p>${fmt(t.readers)}</p></div></div>
      <h4>가상의 예시 행 <span class="ev infer">가상 값</span></h4>
      ${sampleTable(t.sample.cols, t.sample.rows)}
      ${t.note ? `<p class="muted">${fmt(t.note)}</p>` : ''}
    </article>`;
  }
  function joinsBlock() {
    return G.joins.map((j) => `<article class="card"><h3>${esc(j.title)}</h3><p class="muted">${esc(j.why)}</p>
      <pre class="code">${esc(j.sql)}</pre><span class="eyebrow">결과 (가상 행 기준)</span>${sampleTable(j.cols, j.rows)}
      <p>${fmt(j.note)}</p><div><span class="muted" style="font-size:.78rem;font-weight:600">이 데이터를 쓰는 코드</span> ${ref(j.code)}</div></article>`).join('');
  }
  function tableList() {
    return Object.keys(G.tableGroups).map((g) => `<div class="row" style="gap:8px"><span class="muted" style="font-size:.8rem;min-width:5em">${esc(g)}</span><div class="tlist">${G.tableGroups[g].map((n) => `<a href="#t-${n}" ${n === tableSel ? 'aria-current="true"' : ''}>${n}</a>`).join('')}</div></div>`).join('');
  }
  function viewDb() {
    return `<div class="wrap"><div class="prose"><span class="eyebrow">도구</span><h1>ERD와 테이블 사전</h1>
      <p class="lead">표를 누르면 "이 표의 한 행은 무엇인가"부터 보인다. 예시 행은 스키마에 맞춘 가상 값이다.</p></div>
      ${erdBlock()}<div class="sec">${tableList()}</div><div id="tdwrap">${tableDetail(tableSel)}</div>
      <section class="sec"><h2>JOIN으로 이어 보기</h2><p class="muted">코드는 대부분 리포지토리로 표를 하나씩 읽는다. 아래는 DB 콘솔에서 관계를 확인하는 예제다.</p>${joinsBlock()}</section>
      <p>배경 설명은 <a href="#u8">${unitNo('u8')}단원 DB 설계</a>.</p></div>`;
  }
  function bindErd(root) {
    placeErdLabels(root);
    root.querySelectorAll('[data-table]').forEach((g) => {
      const pick = () => {
        tableSel = g.dataset.table;
        if (location.hash.slice(1).startsWith('t-') || location.hash === '#db') history.replaceState(null, '', '#t-' + tableSel);
        root.querySelectorAll('[data-table]').forEach((x) => x.classList.toggle('on', x.dataset.table === tableSel));
        const d = root.querySelector('#tabledetail');
        if (d) { d.outerHTML = tableDetail(tableSel); }
        root.querySelectorAll('.tlist a').forEach((a) => a.toggleAttribute('aria-current', a.textContent === tableSel));
        const nd = root.querySelector('#tabledetail');
        if (nd && window.innerWidth < 860) nd.scrollIntoView({ block: 'start' });
      };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
  }

  // ───────── 개념·문제·설계 ─────────
  function viewConcepts(focus) {
    return `<div class="wrap"><div class="prose"><span class="eyebrow">도구</span><h1>개념 사전</h1>
      <p class="lead">처음 나오는 서버·DB 용어를 짧게 설명하고, 바로 우리 코드의 어디에 해당하는지 붙였다.</p></div>
      <div class="row">${G.concepts.map((c) => `<a class="chip" href="#c-${c.id}">${esc(c.term)}</a>`).join('')}</div>
      ${G.concepts.map((c) => `<article class="card" id="c-${c.id}"${focus === c.id ? ' style="border-color:var(--accent)"' : ''}><h3>${esc(c.term)}</h3><p>${fmt(c.short)}</p>
        <div class="box" style="padding:12px 14px"><span class="eyebrow">우리 코드에서는</span><p>${fmt(c.ours)}</p>${refs(c.refs)}</div>
        ${usedIn(c.id)}</article>`).join('')}</div>`;
  }
  function usedIn(id) {
    const us = G.units.filter((u) => u.sections.some((s) => (s.concepts || []).includes(id)));
    return us.length ? `<p class="muted" style="font-size:.85rem">나오는 단원: ${us.map((u) => `<a href="#${u.id}">${unitNo(u.id)}. ${esc(u.title.split(':')[0])}</a>`).join(' · ')}</p>` : '';
  }
  function viewQuiz() {
    return `<div class="wrap"><div class="prose"><span class="eyebrow">도구</span><h1>확인 문제 모음</h1>
      <p class="lead">모든 단원의 질문. 답을 열기 전에 먼저 소리 내어 설명해 보고, 근거 코드를 열어 맞춰 본다.</p>
      <div class="row"><button type="button" class="btn" id="openall">답 모두 펼치기</button><button type="button" class="btn" id="closeall">모두 접기</button></div></div>
      ${G.units.map((u) => `<section class="sec"><h2><a href="#${u.id}" style="color:inherit;text-decoration:none">${unitNo(u.id)}. ${esc(u.title)}</a></h2>${u.quiz.map(qa).join('')}</section>`).join('')}</div>`;
  }
  function designBlock() {
    return `<section class="sec"><h3>핵심 설계 선택</h3>${G.decisions.map(decisionCard).join('')}</section>
      <section class="sec"><h3>구현의 한계</h3>${G.limits.map(limitCard).join('')}</section>
      <section class="sec"><h3>한계였다가 고친 것</h3><p class="muted">이 가이드의 한계 목록에 있던 항목을 PR로 고친 기록. 고치기 전과 후를 같이 본다.</p>${G.fixed.map(fixedCard).join('')}</section>
      <section class="sec"><h3>멘토에게 물어볼 질문</h3>${questionsList()}</section>`;
  }
  const decisionCard = (d) => `<article class="card"><div class="row">${ev(d.ev)}</div><h3>${esc(d.t)}</h3>
    <div class="tbl" style="border:0"><table><tbody><tr><th>무엇을</th><td>${fmt(d.what)}</td></tr><tr><th>왜</th><td>${fmt(d.why)}</td></tr><tr><th>대가</th><td>${fmt(d.cost)}</td></tr></tbody></table></div>${refs(d.refs)}</article>`;
  const limitCard = (l) => `<article class="card"><div class="row">${ev(l.ev)}</div><h3>${esc(l.t)}</h3><p>${fmt(l.d)}</p>${refs(l.refs)}</article>`;
  const fixedCard = (f) => `<article class="card"><div class="row">${ev(f.ev)} <a class="chip" href="${G.meta.gh}/pull/${f.pr}" target="_blank" rel="noopener">PR #${f.pr}</a></div><h3>${esc(f.t)}</h3>
    <div class="tbl" style="border:0"><table><tbody><tr><th>전</th><td>${fmt(f.before)}</td></tr><tr><th>후</th><td>${fmt(f.after)}</td></tr></tbody></table></div>${refs(f.refs)}</article>`;
  const questionsList = () => `<ol style="margin:0;padding-left:1.4em;display:grid;gap:10px">${G.questions.map((q) => `<li><span class="chip">${esc(q.about)}</span> ${fmt(q.q)}</li>`).join('')}</ol>`;
  function viewLimits() {
    return `<div class="wrap"><div class="prose"><span class="eyebrow">도구</span><h1>설계 선택과 한계</h1>
      <p class="lead">이유가 코드·주석에 직접 있으면 <span class="ev code">코드</span>, 코드에서 읽어 낸 것이면 <span class="ev infer">추론</span>으로 표시했다. 장점을 홍보하려는 목록이 아니라 판단의 근거와 대가를 함께 보려는 목록이다.</p></div>
      ${designBlock()}</div>`;
  }

  // ───────── 설명 모드 ─────────
  function viewExplain(n) {
    const S = G.explain;
    n = Math.max(1, Math.min(n, S.length));
    const s = S[n - 1];
    let body = '';
    if (s.kind === 'intro') body = `<p class="lead">앱에서 모은 시드머니로 지난 주식·적금을 실험해 보고, 목표를 세우고, 청년 금융 소식을 보는 데스크톱 웹. 아래는 코드 기준 구현 상태다.</p>${statusTable({ done: ['구현', 'test'], sample: ['화면·예시만', 'infer'], plan: ['계획만', 'plan'], out: ['범위 밖', 'plan'], demo: ['시연', 'code'] })}`;
    if (s.kind === 'map') body = mapBlock();
    if (s.kind === 'flow') body = `<p class="lead">${esc(G.flows[s.flow].summary)}</p>${flowPlayer(s.flow, 0, true)}`;
    if (s.kind === 'erd') body = erdBlock() + `<div id="tdwrap">${tableDetail(tableSel)}</div>`;
    if (s.kind === 'decisions') body = G.decisions.map(decisionCard).join('');
    if (s.kind === 'limits') body = G.limits.map(limitCard).join('') + `<h3>한계였다가 고친 것</h3>` + G.fixed.map(fixedCard).join('');
    if (s.kind === 'questions') body = questionsList();
    return `<div class="slide">
      <div class="slidebar"><nav class="dots" aria-label="장 이동">${S.map((x, i) => `<a href="#explain.${i + 1}" ${i + 1 === n ? 'aria-current="true"' : ''} title="${esc(x.title)}">${i + 1}</a>`).join('')}</nav>
        <div class="row"><a class="btn" href="#${s.more}">학습 모드에서 자세히</a>${n > 1 ? `<a class="btn" href="#explain.${n - 1}">← 이전</a>` : ''}${n < S.length ? `<a class="btn primary" href="#explain.${n + 1}">다음 →</a>` : ''}</div></div>
      <span class="eyebrow">설명 ${n} / ${S.length}</span><h1>${esc(s.title)}</h1>
      <div class="talk">${s.talk.map((t) => `<p>${fmt(t)}</p>`).join('')}</div>
      ${body}</div>`;
  }

  // ───────── 검색 ─────────
  let index = null;
  function buildIndex() {
    const out = [];
    const add = (type, title, text, href) => out.push({ type, title, text: String(text || ''), href, hay: (title + ' ' + (text || '')).toLowerCase() });
    G.units.forEach((u, i) => {
      add('단원', `${i + 1}. ${u.title}`, u.goal, u.id);
      u.sections.forEach((s) => add('단원 내용', s.h, s.body.join(' ') + ' ' + (s.refs || []).map((r) => r.f + ' ' + r.s).join(' '), u.id));
      u.quiz.forEach((q) => add('확인 문제', q.q, q.a, u.id));
    });
    Object.keys(G.flows).forEach((k) => {
      const f = G.flows[k];
      add('요청 흐름', f.title, f.req + ' ' + f.summary, 'flow-' + k);
      f.steps.forEach((s, i) => add('흐름 단계', `${f.title} · ${i + 1}. ${s.title}`, s.process + ' ' + s.refs.map((r) => r.f + ' ' + r.s).join(' '), `flow-${k}.${i + 1}`));
    });
    G.code.forEach((c) => add('코드', c.path, c.role + ' ' + c.keys.map((r) => r.s).join(' '), 'code-' + c.id));
    G.tables.forEach((t) => add('테이블', t.name, t.row + ' ' + t.cols.map((c) => c[0] + ' ' + c[3]).join(' '), 't-' + t.name));
    G.concepts.forEach((c) => add('개념', c.term, c.short + ' ' + c.ours, 'c-' + c.id));
    G.decisions.forEach((d) => add('설계 선택', d.t, d.what + ' ' + d.why, 'limits'));
    G.limits.forEach((l) => add('한계', l.t, l.d, 'limits'));
    G.fixed.forEach((f) => add('고친 한계', f.t, f.before + ' ' + f.after, 'limits'));
    return out;
  }
  const qi = $('#q');
  const res = $('#results');
  let hits = [];
  let hi = 0;
  function search() {
    index = index || buildIndex();
    const terms = qi.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { res.hidden = true; return; }
    hits = index.filter((x) => terms.every((t) => x.hay.includes(t))).slice(0, 14);
    hi = 0;
    res.innerHTML = hits.length ? hits.map((h, i) => `<a href="#${h.href}" class="${i === 0 ? 'on' : ''}"><span class="t">${esc(h.type)}</span>${esc(h.title)}<span class="s">${esc(h.text.slice(0, 140))}</span></a>`).join('') : '<a href="#" onclick="return false"><span class="s">찾은 항목이 없다. 파일 이름·함수 이름·표 이름으로 찾아보자.</span></a>';
    res.hidden = false;
  }
  qi.addEventListener('input', search);
  qi.addEventListener('focus', () => qi.value && search());
  qi.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(hits.length, 1);
      res.querySelectorAll('a').forEach((a, i) => a.classList.toggle('on', i === hi));
    } else if (e.key === 'Enter' && hits[hi]) { location.hash = hits[hi].href; res.hidden = true; qi.blur(); }
    else if (e.key === 'Escape') { res.hidden = true; qi.blur(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) res.hidden = true; else if (e.target.closest('.results a')) res.hidden = true; });

  // ───────── 라우팅 ─────────
  function route() {
    const h = decodeURIComponent(location.hash.slice(1)) || 'start';
    let m;
    if ((m = h.match(/^explain(?:\.(\d+))?$/))) return { name: 'explain', n: +(m[1] || 1) };
    if ((m = h.match(/^flow-([a-z]+)(?:\.(\d+))?$/))) return { name: 'flow', id: m[1], step: +(m[2] || 1) - 1 };
    if ((m = h.match(/^t-([a-z_]+)$/))) return { name: 'db', table: m[1] };
    if ((m = h.match(/^c-([a-z-]+)$/))) return { name: 'concepts', focus: m[1] };
    if ((m = h.match(/^code-([a-z-]+)$/))) return { name: 'code', focus: m[1] };
    if (unitById(h)) return { name: 'unit', id: h };
    return { name: ['start', 'map', 'flows', 'code', 'db', 'concepts', 'quiz', 'limits'].includes(h) ? h : 'start' };
  }
  function render() {
    const r = route();
    const h = decodeURIComponent(location.hash.slice(1)) || 'start';
    document.body.classList.toggle('explain', r.name === 'explain');
    $('#m-learn').setAttribute('aria-current', String(r.name !== 'explain'));
    $('#m-explain').setAttribute('aria-current', String(r.name === 'explain'));
    renderSide(r.name === 'flow' ? 'flows' : r.name === 'db' ? 'db' : r.name === 'concepts' ? 'concepts' : r.name === 'code' ? 'code' : h);
    let html = '';
    if (r.name === 'start') html = viewStart();
    else if (r.name === 'map') html = viewMap();
    else if (r.name === 'flows') html = viewFlows();
    else if (r.name === 'flow') html = viewFlow(r.id, r.step);
    else if (r.name === 'unit') html = viewUnit(unitById(r.id));
    else if (r.name === 'code') html = viewCode(r.focus);
    else if (r.name === 'db') { if (r.table && G.tables.some((t) => t.name === r.table)) tableSel = r.table; html = viewDb(); }
    else if (r.name === 'concepts') html = viewConcepts(r.focus);
    else if (r.name === 'quiz') html = viewQuiz();
    else if (r.name === 'limits') html = viewLimits();
    else if (r.name === 'explain') html = viewExplain(r.n);
    main.innerHTML = html;
    bindMap(main);
    bindErd(main);
    bindFlows(main, r.name === 'flow' ? (id, cur) => history.replaceState(null, '', `#flow-${id}.${cur + 1}`) : null);
    if (r.name === 'code') bindCode();
    if (r.name === 'unit') {
      const cb = $('#done-' + r.id);
      cb.addEventListener('change', () => { const d = store.get('done', {}); d[r.id] = cb.checked; store.set('done', d); renderSide(r.id); });
    }
    if (r.name === 'quiz') {
      $('#openall').addEventListener('click', () => main.querySelectorAll('details.qa').forEach((d) => (d.open = true)));
      $('#closeall').addEventListener('click', () => main.querySelectorAll('details.qa').forEach((d) => (d.open = false)));
    }
    const target = r.focus ? $('#' + (r.name === 'concepts' ? 'c-' : 'code-') + r.focus) : null;
    if (target) target.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
    document.title = '텅장관리 코드 학습 가이드';
  }
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === '/') { e.preventDefault(); qi.focus(); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const r = route();
    const d = e.key === 'ArrowRight' ? 1 : -1;
    if (r.name === 'explain') { const n = r.n + d; if (n >= 1 && n <= G.explain.length) location.hash = 'explain.' + n; }
    else {
      const p = main.querySelector('.flowplayer');
      const b = p && p.querySelector(`[data-go="${d}"]`);
      if (b && !b.disabled) b.click();
    }
  });

  $('#baseline').textContent = `기준 커밋 ${G.meta.commitShort} · ${G.meta.analyzedOn} 분석`;
  render();
})();
