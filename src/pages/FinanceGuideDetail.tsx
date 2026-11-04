// 금융 가이드 콘텐츠 상세(/guide/:category/:id). 콘텐츠가 여러 개여도 화면은 이 파일 하나(템플릿)이고, 내용은 data/guideArticles.ts에서 id로 가져온다.
// 경로 표시 → 표지 → 제목 영역(분류·제목·해시태그) → 섹션(문단·계산식·용어 목록·FAQ) → 푸터(안내·출처).
// 원고가 없거나 승인 전(draft)인 콘텐츠는 운영 화면에서 '준비 중'을 보여 준다. draft 본문은 npm run dev에서만 보이고 위에 안내 띠를 붙인다. 주소의 카테고리가 콘텐츠와 다르면 맞는 주소로 바꾸고, 없는 id면 카테고리 화면으로 보낸다.
import { Fragment, useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { CATEGORY_LABEL, GUIDE_CONTENTS, isGuideCategory, type GuideContent } from '@/data/financeGuide';
import { GUIDE_ARTICLES, type GuideBlock } from '@/data/guideArticles';
import '@/styles/finance-guide.css';

export default function FinanceGuideDetail() {
  const { category, id } = useParams();
  if (!isGuideCategory(category)) return <Navigate to="/guide" replace />;
  const content = GUIDE_CONTENTS.items.find((c) => c.id === id);
  if (!content) return <Navigate to={`/guide/${category}`} replace />;
  if (content.category !== category) return <Navigate to={`/guide/${content.category}/${content.id}`} replace />;
  return <DetailPage key={content.id} c={content} />;
}

function DetailPage({ c }: { c: GuideContent }) {
  const label = CATEGORY_LABEL[c.category];
  const article = GUIDE_ARTICLES[c.id];
  const title = article?.title ?? c.title;

  // 다른 콘텐츠로 넘어오면 맨 위부터 읽게 한다
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <section>
      <div className="page fin fin-detail">
        <nav className="fin-crumb" aria-label="현재 위치">
          <Link to="/guide">금융 가이드</Link>
          <ChevronIcon />
          <Link to={`/guide/${c.category}`}>{label}</Link>
          <ChevronIcon />
          <span aria-current="page">{title}</span>
        </nav>

        <article className="fin-article" aria-labelledby="fin-article-title">
          {article?.status === 'draft' && <p className="fin-article-draft">승인 전(draft) 글이에요. 개발 화면에서만 보이고 운영 화면에서는 '준비 중'으로 보여요.</p>}
          {article?.cover && <img className="fin-cover fin-cover-img" src={article.cover.src} alt={article.cover.alt} width={760} height={380} decoding="async" />}

          <header className="fin-article-head">
            <span className="fin-article-cat">{label}</span>
            <h1 id="fin-article-title">{title}</h1>
            <p className="fin-article-tags">{article?.hashtags ?? `#${c.tag}`}</p>
          </header>

          {article ? (
            <>
              {article.sections.map((s) => (
                <section key={s.title} className="fin-article-sec">
                  <h2>{s.title}</h2>
                  {s.blocks.map((b, i) => (
                    <Block key={i} b={b} />
                  ))}
                </section>
              ))}
              {article.footer && (
                <footer className="fin-article-foot">
                  {article.footer.notes.map((n) => (
                    <p key={n}>{n}</p>
                  ))}
                  {article.footer.sources.length > 0 && (
                    <ul className="fin-article-sources" aria-label="출처">
                      {article.footer.sources.map((s) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noopener noreferrer">
                            {s.label}
                            <span className="sr-only"> (새 탭)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </footer>
              )}
            </>
          ) : (
            <div className="fin-article-soon">
              <p>이 콘텐츠의 자세한 내용은 준비 중이에요.</p>
              <Link className="btn btn-line" to={`/guide/${c.category}`}>
                {label} 목록 보기
              </Link>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function Block({ b }: { b: GuideBlock }) {
  switch (b.type) {
    case 'p':
      return (
        <p className="fin-article-p">
          <Rich text={b.text} />
        </p>
      );
    case 'calc':
      return (
        <figure className="fin-calc">
          <div className="fin-calc-box">
            {b.terms.map((t, i) => (
              <Fragment key={t.label}>
                {i > 0 && <span className="fin-calc-op">{b.ops[i - 1]}</span>}
                <span className={`fin-calc-term${i === b.terms.length - 1 ? ' result' : ''}`}>
                  <span className="fin-calc-label">{t.label}</span>
                  <b className="fin-calc-value">{t.value}</b>
                </span>
              </Fragment>
            ))}
          </div>
          <figcaption>{b.caption}</figcaption>
        </figure>
      );
    case 'terms':
      return (
        <dl className="fin-terms-dl">
          {b.items.map((t) => (
            <div key={t.term}>
              <dt>{t.term}</dt>
              <dd>
                <Rich text={t.desc} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'faq':
      return (
        <div className="fin-faq">
          {b.items.map((f, i) => (
            <div key={f.q} className="fin-faq-item">
              <h3>
                <span className="fin-faq-icon" aria-hidden="true">{FAQ_NUMBERS[i] ?? `${i + 1}.`}</span>
                <span>{f.q}</span>
              </h3>
              <p>
                <span className="fin-faq-icon" aria-hidden="true">{FAQ_MARKS[f.mark ?? 'tip']}</span>
                <span>
                  <Rich text={f.a} />
                </span>
              </p>
            </div>
          ))}
        </div>
      );
  }
}

/** FAQ 질문 앞 번호(질문 순서대로 자동으로 붙인다) */
const FAQ_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
/** FAQ 답 앞 표시: yes(네로 시작하는 답) ✅, no(아니요로 시작하는 답) ❌, tip(설명형 답, 기본값) 💡 */
const FAQ_MARKS = { yes: '✅', no: '❌', tip: '💡' } as const;

/** 문장 안의 **굵게** 표시를 굵은 글자로 바꾼다 */
function Rich({ text }: { text: string }) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

const ChevronIcon = () => (
  <svg className="fin-crumb-sep" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
