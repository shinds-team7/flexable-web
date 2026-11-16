// 프로젝트 소개 페이지 틀(/info-web, /info-app). 24인치 세로(틸트) 모니터에 띄워 위에서 아래로 스크롤하며 보는 전시용 화면이다.
// 메뉴·링크에는 없고 주소를 직접 입력해서만 들어온다. 서버 API는 부르지 않는다.
// 디자인은 메인 랜딩(/home)을 따른다: 신한 블루 하늘 히어로, 흰 카드, 블루 점 브라우저 틀, 관성 휠 스크롤(useSmoothWheel),
// 아래에서 위로 나타나기(useReveal). 발표 자료의 알약 라벨·옅은 블루 바탕·광원 장식을 더했다.
// 표지의 목차 카드를 누르면 그 구역으로 부드럽게 내려간다.
// ?auto=1 을 붙이면 천천히 저절로 내려가고, 끝에 닿으면 잠시 멈췄다가 처음으로 돌아간다(손을 대면 10초 쉰다).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { prefersReducedMotion, useReveal, useSmoothWheel } from '@/lib/motion';
import { Bars, BrowserShot, IconTile, Img, PhoneShot, Ring } from './parts';
import type { InfoContent } from './types';
import '@/styles/info.css';

const SECTIONS = [
  ['story', '마일스톤', 'MILESTONE'],
  ['origin', '기획', 'BACKGROUND'],
  ['values', '핵심 가치', 'CORE VALUE'],
  ['journey', '사용 흐름', 'USER JOURNEY'],
  ['features', '기능', 'FEATURES'],
  ['tech', '기술', 'TECH STACK'],
  ['arch', '아키텍처', 'ARCHITECTURE'],
  ['principles', '설계 원칙', 'PRINCIPLES'],
  ['collab', '협업 방법', 'COLLABORATION'],
] as const;

const delay = (i: number) => ({ '--i': i }) as CSSProperties;
const nn = (i: number) => String(i).padStart(2, '0');
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 목표 위치까지 1.1~1.8초 동안 천천히 출발해 미끄러지듯 멈추는 스크롤 */
function glideTo(top: number) {
  if (prefersReducedMotion()) {
    window.scrollTo({ top, behavior: 'instant' });
    return;
  }
  const start = window.scrollY;
  const dist = top - start;
  const dur = Math.min(1800, 1100 + Math.abs(dist) / 20);
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur);
    window.scrollTo({ top: start + dist * easeInOutCubic(t), behavior: 'instant' });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function Head({ n, title, lead }: { n: number; title: string; lead: string }) {
  return (
    <header className="info-head reveal">
      <p className="info-pill">
        <b>{nn(n)}</b>
        {SECTIONS[n - 1][2]}
      </p>
      <p className="info-kicker">{SECTIONS[n - 1][1]}</p>
      <h2>{title}</h2>
      <p className="info-lead">{lead}</p>
    </header>
  );
}

/** 구역 바탕은 흰색과 옅은 블루(wash)를 번갈아 쓴다 */
function Section({ id, n, children }: { id: string; n: number; children: ReactNode }) {
  return (
    <section id={id} className={`info-sec${n % 2 ? ' wash' : ''}`} data-n={n}>
      <span className="info-glow a" aria-hidden="true" />
      <span className="info-glow b" aria-hidden="true" />
      <div className="info-in">{children}</div>
    </section>
  );
}

/** 맨 위 진행 막대 + 왼쪽 위 현재 구역 이름 */
function useProgress(bar: React.RefObject<HTMLDivElement | null>, root: React.RefObject<HTMLElement | null>) {
  const [current, setCurrent] = useState(-1);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      const secs = root.current ? [...root.current.querySelectorAll<HTMLElement>('.info-sec')] : [];
      const mid = window.innerHeight * 0.4;
      let idx = -1;
      secs.forEach((s, i) => {
        if (s.getBoundingClientRect().top <= mid) idx = i;
      });
      setCurrent(idx);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, [bar, root]);
  return current;
}

/** 전시용 자동 스크롤(초당 speed px). 사용자가 휠·터치·키를 쓰면 10초 쉬었다가 이어 간다 */
function useAutoScroll(on: boolean, speed = 48) {
  useEffect(() => {
    if (!on || prefersReducedMotion()) return;
    let raf = 0;
    let timer = 0;
    let last = 0;
    let pos = window.scrollY;
    let pauseUntil = performance.now() + 2500;
    const tick = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 0;
      last = now;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (now >= pauseUntil) {
        if (window.scrollY >= max - 1) {
          // 끝: 6초 멈춘 뒤 맨 위로 미끄러져 돌아가고, 잠시 뒤 다시 내려간다
          pauseUntil = now + 10000;
          timer = window.setTimeout(() => glideTo(0), 6000);
        } else {
          if (Math.abs(window.scrollY - pos) > 4) pos = window.scrollY;
          pos = Math.min(max, pos + (speed * dt) / 1000);
          window.scrollTo({ top: pos, behavior: 'instant' });
        }
      } else {
        pos = window.scrollY;
      }
      raf = requestAnimationFrame(tick);
    };
    const rest = () => {
      pauseUntil = performance.now() + 10000;
    };
    const evs = ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const;
    evs.forEach((t) => window.addEventListener(t, rest, { passive: true }));
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      evs.forEach((t) => window.removeEventListener(t, rest));
    };
  }, [on, speed]);
}

export function InfoPage({ c, variant }: { c: InfoContent; variant: 'web' | 'app' }) {
  const root = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [params] = useSearchParams();
  useSmoothWheel();
  useReveal(root);
  useAutoScroll(params.get('auto') === '1', Number(params.get('speed')) || 48);
  const current = useProgress(bar, root);

  useEffect(() => {
    const prev = document.title;
    document.title = c.docTitle;
    return () => {
      document.title = prev;
    };
  }, [c.docTitle]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (el) glideTo(el.getBoundingClientRect().top + window.scrollY);
  };

  const Shot = c.features.frame === 'browser' ? BrowserShot : PhoneShot;

  return (
    <main ref={root} className={`info info-${variant}`}>
      <div className="info-progress" aria-hidden="true">
        <div ref={bar} />
      </div>
      <button type="button" className={`info-chip${current >= 0 ? ' on' : ''}`} tabIndex={current >= 0 ? 0 : -1} onClick={() => glideTo(0)} aria-label="맨 위 목차로">
        <b>{c.brand}</b>
        <span>{current >= 0 ? `${nn(current + 1)} ${SECTIONS[current][1]}` : ''}</span>
      </button>

      {/* 0. 표지 */}
      <header className={`info-hero${c.hero.illust ? ' illust' : ''}`}>
        <div className="info-in">
          <div className="info-hero-copy reveal">
            <p className="info-hero-kicker">{c.hero.kicker}</p>
            <h1>{c.hero.title}</h1>
            <p className="info-hero-lead">{c.hero.lead}</p>
          </div>
          <nav className="info-toc reveal" aria-label="목차">
            {SECTIONS.map(([id, label, en], i) => (
              <button key={id} type="button" onClick={() => go(id)}>
                <span>{nn(i + 1)}</span>
                <b>{label}</b>
                <small>{en}</small>
              </button>
            ))}
          </nav>
          <div className="info-hero-visual reveal reveal-late">{c.hero.visual}</div>
        </div>
        <button type="button" className="info-scroll" aria-label="아래로 스크롤" onClick={() => go('story')}>
          <span>scroll</span>
          <i aria-hidden="true">»</i>
        </button>
      </header>

      {/* 1. 마일스톤(협업 과정) */}
      <Section id="story" n={1}>
        <Head n={1} title={c.story.title} lead={c.story.lead} />
        <div className="info-numbers">
          {c.story.numbers.map((s, i) => (
            <div key={s.label} className="reveal" style={delay(i)}>
              <strong>
                {s.value}
                {s.unit && <small>{s.unit}</small>}
              </strong>
              <p>{s.label}</p>
            </div>
          ))}
        </div>
        <ol className="info-timeline">
          {c.story.timeline.map((m) => (
            <li key={m.date + m.title} className="reveal">
              <time>{m.date}</time>
              <div>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="info-gallery">
          {c.story.photos.map((p, i) => (
            <figure key={p.src} className={`reveal${p.wide ? ' wide' : ''}`} style={delay(i % 2)}>
              <Img src={p.src} alt={p.caption} ratio={p.wide ? '16 / 9' : '4 / 3'} label="협업 사진" />
              <figcaption>{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* 2. 기획 */}
      <Section id="origin" n={2}>
        <Head n={2} title={c.origin.title} lead={c.origin.lead} />
        <div className="info-stats">
          {c.origin.stats.map((s, i) => (
            <div key={s.label} className={`info-stat reveal${s.viz ? ' has-viz' : ''}`} style={delay(i)}>
              <div className="info-stat-copy">
                <strong>
                  {s.value}
                  {s.unit && <small>{s.unit}</small>}
                </strong>
                <p>{s.label}</p>
              </div>
              {s.viz?.kind === 'ring' && <Ring pct={s.viz.pct} />}
              {s.viz?.kind === 'bars' && <Bars {...s.viz} />}
            </div>
          ))}
        </div>
        <p className="info-source reveal">출처: {c.origin.source}</p>

        <div className="info-pain-head reveal">
          <p className="info-pill sm">PAIN POINTS &amp; SOLUTION</p>
          <h3>고민과 해결책</h3>
        </div>
        <div className="info-pains">
          {c.origin.pains.map((p, i) => (
            <article key={p.title} className="info-pain reveal" style={delay(i)}>
              <span className="info-pain-q">{p.pain}</span>
              <IconTile name={p.icon} />
              <h4>{p.title}</h4>
              <p>{p.desc}</p>
              <span className="info-pain-tag">{p.tag}</span>
            </article>
          ))}
        </div>
        <blockquote className="info-answer reveal">{c.origin.answer}</blockquote>
      </Section>

      {/* 3. 핵심 가치 */}
      <Section id="values" n={3}>
        <Head n={3} title="우리가 다르게 만든 세 가지" lead={`${c.brand}가 다른 서비스와 갈라지는 지점이에요.`} />
        <div className="info-values">
          {c.values.map((v, i) => (
            <article key={v.title} className="info-value reveal" style={delay(i)}>
              <span className="info-value-n">{nn(i + 1)}</span>
              <h3>{v.title}</h3>
              <p>{v.desc}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* 4. 사용 흐름 */}
      <Section id="journey" n={4}>
        <Head n={4} title={c.journey.title} lead={c.journey.lead} />
        <ol className="info-journey">
          {c.journey.steps.map((s, i) => (
            <li key={s.title} className="reveal" style={delay(i)}>
              <span>{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* 5. 기능 */}
      <Section id="features" n={5}>
        <Head n={5} title={c.features.title} lead={c.features.lead} />
        <div className={`info-features ${c.features.frame}`}>
          {c.features.items.map((f, i) => (
            <article key={f.name} className={`info-feature${i % 2 ? ' flip' : ''}`}>
              <div className="info-feature-copy reveal">
                <h3>{f.head}</h3>
                <p className="info-feature-name">
                  <span>{nn(i + 1)}</span>
                  {f.name}
                </p>
                <p className="info-feature-desc">{f.desc}</p>
                {f.points && (
                  <ul>
                    {f.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {f.where && <span className="info-where">{f.where}</span>}
              </div>
              <div className="info-feature-shot reveal reveal-late">
                <Shot src={f.img} alt={`${f.name} 화면`} url={c.features.frame === 'browser' ? f.where : undefined} />
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* 6. 기술 */}
      <Section id="tech" n={6}>
        <Head n={6} title={c.tech.title} lead={c.tech.lead} />
        <div className="info-stack">
          {c.tech.stack.map((g, i) => (
            <div key={g.group} className="info-stack-group reveal" style={delay(i % 2)}>
              <h3>{g.group}</h3>
              <ul>
                {g.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* 7. 아키텍처 */}
      <Section id="arch" n={7}>
        <Head n={7} title={c.arch.title} lead={c.arch.lead} />
        <div className="arch">{c.arch.diagram}</div>
        <div className="info-cards">
          {c.arch.notes.map((n, i) => (
            <div key={n.title} className="info-card reveal" style={delay(i % 2)}>
              {n.tag && <span className="info-card-tag">{n.tag}</span>}
              <h3>{n.title}</h3>
              <p>{n.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 8. 설계 원칙 */}
      <Section id="principles" n={8}>
        <Head n={8} title={c.principles.title} lead={c.principles.lead} />
        <div className="info-cards">
          {c.principles.items.map((n, i) => (
            <div key={n.title} className="info-card reveal" style={delay(i % 2)}>
              {n.tag && <span className="info-card-tag">{n.tag}</span>}
              <h3>{n.title}</h3>
              <p>{n.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 9. 협업 방법 */}
      <Section id="collab" n={9}>
        <Head n={9} title={c.collab.title} lead={c.collab.lead} />
        <ol className="info-flow">
          {c.collab.flow.map((s, i) => (
            <li key={s.title} className="reveal" style={delay(i % 2)}>
              <span>{nn(i + 1)}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </li>
          ))}
        </ol>
        <div className="info-cards">
          {c.collab.rules.map((n, i) => (
            <div key={n.title} className="info-card reveal" style={delay(i % 2)}>
              {n.tag && <span className="info-card-tag">{n.tag}</span>}
              <h3>{n.title}</h3>
              <p>{n.desc}</p>
            </div>
          ))}
        </div>
      </Section>


      {/* 마무리 */}
      <footer className="info-outro">
        <span className="info-outro-mark" aria-hidden="true">
          {c.watermark}
        </span>
        <svg className="info-outro-bg" viewBox="0 0 1080 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g fill="none" stroke="var(--color-land-glass-line)" strokeWidth="1.5" opacity=".6">
            {[50, 90, 130, 170].map((r) => (
              <circle key={`a${r}`} cx="60" cy="80" r={r} />
            ))}
            {[40, 80, 120, 160].map((r) => (
              <circle key={`b${r}`} cx="1020" cy="800" r={r} />
            ))}
          </g>
          <g fill="var(--color-land-glass)">
            <rect x="-60" y="620" width="220" height="220" rx="64" />
            <circle cx="980" cy="120" r="36" />
            <circle cx="900" cy="720" r="22" />
          </g>
        </svg>
        <div className="info-in reveal">
          <h2>{c.outro.title}</h2>
          <p>{c.outro.lead}</p>
          <ul>
            {c.outro.links.map((l) => (
              <li key={l.url}>
                <span>{l.label}</span>
                <b>{l.url}</b>
              </li>
            ))}
          </ul>
          <small>{c.brandSub}</small>
        </div>
      </footer>
    </main>
  );
}
