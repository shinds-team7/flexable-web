// /type/about: 투자성향분석이란? 금융 가이드형 단일 페이지(목차 + 본문 섹션).
// 그림은 public/type/about/ 에 파일을 넣으면 자동으로 보인다. 없으면 자리 표시 상자가 보이고, optional 그림은 숨긴다.
import { useState } from 'react';
import { Link } from 'react-router-dom';

const IMG = '/type/about';

const TOC = [
  { id: 'what', label: '투자성향분석이란?' },
  { id: 'when', label: '언제 하나요?' },
  { id: 'steps', label: '투자성향 설문' },
  { id: 'types', label: '투자성향, 어떻게 나뉘나요?' },
] as const;

/** 그림 한 장. 파일이 없으면(404) 만들어 달라는 설명이 든 빈 상자를 보인다 */
function Figure({ name, alt, caption, wide, optional }: { name: string; alt: string; caption?: string; wide?: boolean; optional?: boolean }) {
  const [missing, setMissing] = useState(false);
  if (missing && optional) return null; // 선택 그림은 파일이 없으면 통째로 숨긴다
  return (
    <figure className={`ia-fig${wide ? ' wide' : ''}`}>
      {missing ? (
        <div className="ia-fig-empty" role="img" aria-label={alt}>
          <b>그림 자리</b>
          <span>{alt}</span>
          <code>{`${IMG}/${name}`}</code>
        </div>
      ) : (
        <img src={`${IMG}/${name}`} alt={alt} loading="lazy" onError={() => setMissing(true)} />
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Cta({ children }: { children: string }) {
  return (
    <div className="ia-cta">
      <span>{children}</span>
      <Link className="btn btn-primary" to="/type/test">
        투자성향 알아보기
      </Link>
    </div>
  );
}

/** 구분 소제목 위에 붙는 작은 표지(예: 투자성향분석 뜻) */
function Head({ id, kicker, title }: { id: string; kicker?: string; title: string }) {
  return (
    <header className="ia-head">
      {kicker && <span className="meta">{kicker}</span>}
      <h2 id={id}>{title}</h2>
    </header>
  );
}

export function InvestorTypeAbout() {
  return (
    <section className="page ia">
      <nav className="ia-toc" aria-label="이 글의 차례">
        <b>차례</b>
        <ol>
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`}>{t.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="ia-body">
        <header className="ia-title">
          <span className="meta">알아 두면 좋아요</span>
          <h1 className="page-title">투자성향분석 왜 하는 걸까? 투자자 유형별 위험등급과 상품선택 기준</h1>
        </header>

        <Figure name="hero.png" alt="투자성향분석 왜 하는 걸까? 투자자 유형별 위험등급과 상품선택 기준 콘텐츠의 메인 이미지" wide />

        <div className="ia-prose">
          <p>
            투자상품을 알아보다 보면 한 번쯤 이런 고민이 생겨요. 내 투자 성향은 어떤 편인지, 어느 정도의 위험까지 감당할 수 있는지, 안정적인 상품이 맞을지, 아니면 수익을 더 기대해도 될지 말이에요.
          </p>
          <p>
            이런 고민을 정리해 주는 과정이 바로 투자성향분석이에요. 투자성향분석은 본격적으로 투자상품에 가입하기 전에 감내할 수 있는 위험 수준을 점검하는 보호 장치예요.
          </p>
        </div>

        <Cta>내 투자성향 어떤지 궁금하다면?</Cta>

        {/* 투자성향분석 뜻 */}
        <section className="ia-sec" aria-labelledby="what">
          <Head id="what" kicker="투자성향분석 뜻" title="투자성향분석이란 무엇인가요?" />
          <div className="ia-prose">
            <p>
              투자성향분석은 투자상품에 가입하기 전에 투자 목적과 투자 경험, 자금 상황 등을 기준으로 개인의 투자 위험 수준을 구체적으로 확인하는 절차예요. 설문에 답한 내용을 바탕으로
            </p>
            <ul>
              <li>투자 경험은 어느 정도인지</li>
              <li>손실이 발생했을 때 어디까지 감내할 수 있는지</li>
              <li>투자 목적과 투자 기간은 어떤지</li>
            </ul>
            <p>등을 종합해 나에게 맞는 투자 유형을 판단해요.</p>
            <p>이 과정은 금융회사가 고객에게 맞지 않는 고위험 상품을 권유하지 않도록 하기 위한 금융소비자보호법에 따른 필수 절차예요.</p>
          </div>
        </section>

        {/* 투자성향분석 시기 */}
        <section className="ia-sec" aria-labelledby="when">
          <Head id="when" kicker="투자성향분석 시기" title="투자성향분석 언제 하나요?" />
          <div className="ia-prose">
            <p>
              투자성향분석은 원금 손실 가능성이 있는 상품에 가입하기 전에 진행해요. 기존에 투자성향분석 결과가 있더라도 일정 기간이 지났거나 투자 목적이나 자금 상황이 달라졌다면 다시 진행해야 해요.
            </p>
          </div>
        </section>

        {/* 대출 계획·설문 */}
        <section className="ia-sec" aria-labelledby="steps">
          <Head id="steps" title="투자성향 설문" />
          <div className="ia-step">
            <div className="ia-box">
              <b>📌 solpa 투자성향 진단 설문 항목</b>
              <dl className="ia-defs">
                <div>
                  <dt>자금 여건과 투자 기반</dt>
                  <dd>나이, 연 소득, 수입원, 금융자산 비중 등을 통해 투자에 활용할 수 있는 자금 상황을 확인해요.</dd>
                </div>
                <div>
                  <dt>투자 경험과 이해도</dt>
                  <dd>투자 경험과 파생상품 투자 경험, 금융상품에 대한 이해 수준을 바탕으로 상품 구조를 얼마나 이해할 수 있는지를 살펴봐요.</dd>
                </div>
                <div>
                  <dt>투자 목표와 태도</dt>
                  <dd>투자 목적, 원금 보존에 대한 생각, 손실을 어느 정도까지 감내할 수 있는지를 통해 위험을 받아들이는 태도를 확인해요.</dd>
                </div>
                <div>
                  <dt>투자 기간</dt>
                  <dd>투자 예정 기간으로 단기 변동성을 감당할 수 있는지를 판단해요.</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* 투자성향 5가지 */}
        <section className="ia-sec" aria-labelledby="types">
          <Head id="types" kicker="투자성향분석 결과 기준" title="투자성향, 어떻게 나뉘나요?" />
          <div className="ia-prose">
            <p>
              투자성향분석을 진행하면, 응답 결과를 바탕으로 투자 성향이 안정형, 안정추구형, 위험중립형, 적극투자형, 공격투자형 총 5가지 유형으로 구분돼요. 각 단계는 감내할 수 있는 위험 수준과 투자 태도를 기준으로 나뉘어요.
            </p>
          </div>
          <ul className="ia-types">
            <li>
              <b>✔️ 안정형</b>
              <span>예금이나 적금 수준의 수익을 기대하며, 투자 원금 손실이 발생하지 않기를 원하는 유형이에요.</span>
            </li>
            <li>
              <b>✔️ 안정추구형</b>
              <span>
                투자 원금 손실 위험은 최소화하면서, 이자소득이나 배당소득 수준의 안정적인 수익을 목표로 해요. 단기적인 손실은 제한적으로 감수할 수 있고, 예적금보다 높은 수익을 위해 자산의 일부를 변동성이 있는 상품에 투자할 의향이 있어요.
              </span>
            </li>
            <li>
              <b>✔️ 위험중립형</b>
              <span>투자에는 수익만큼 위험도 따른다는 점을 인식하고 있어요. 예적금보다 높은 수익을 기대할 수 있다면 일정 수준의 손실 위험을 감수할 수 있는 유형이에요.</span>
            </li>
            <li>
              <b>✔️ 적극투자형</b>
              <span>투자 원금의 보전보다는 위험을 감내하더라도 높은 투자수익을 추구해요. 투자자금의 상당 부분을 주식이나 주식형 펀드, 파생상품 등 위험자산에 투자할 의향이 있어요.</span>
            </li>
            <li>
              <b>✔️ 공격투자형</b>
              <span>시장 평균을 크게 웃도는 높은 투자수익을 목표로 해요. 이를 위해 자산 가치 변동에 따른 손실 위험도 적극적으로 받아들이는 유형이에요. 투자자금 대부분을 주식, 주식형 펀드, 파생상품 등 위험자산에 투자할 의향이 있어요.</span>
            </li>
          </ul>
          <Cta>나는 어떤 투자유형일까?</Cta>
        </section>

        <footer className="ia-notice">
          <p className="meta">이 콘텐츠는 2026년 7월 9일 기준으로 작성되었습니다.</p>
          <b>[유의사항]</b>
          <ul>
            <li>금융투자상품은 예금자보호법에 따라 보호되지 않습니다.</li>
            <li>투자자는 금융투자상품에 대하여 은행으로부터 충분한 설명을 받을 권리가 있으며, 투자전 (간이)투자설명서 및 집합투자규약을 반드시 읽어보시기 바랍니다.</li>
            <li>금융투자상품은 자산가격 변동 및 환율 변동 등에 따라 투자원금의 손실(0~100%)이 발생할 수 있으며 그 손실은 투자자에게 귀속됩니다.</li>
            <li>보수 및 수수료 외 증권거래비용 등이 추가로 발생할 수 있습니다.</li>
            <li>해외투자상품의 경우 환율변동 및 투자대상국가의 시장, 정치 및 경제상황 등에 따른 위험으로 손실이 발생할 수 있습니다.</li>
            <li>동일 유형의 상품이라 할지라도 위험등급이 상이할 수 있으므로 반드시 투자설명서 또는 운용자산설명서를 통해 위험등급을 별도로 확인하여야 합니다.</li>
            <li>상품별 위험등급은 매년 결산시 변동성 기준 또는 97.5% VaR모형 기준에 따라 변경될 수 있습니다.</li>
            <li>기타 자세한 내용은 KB국민은행 지점 또는 고객센터(1588-9999)로 문의하시기 바랍니다.</li>
          </ul>
        </footer>

      <div className="ia-box plain">
        <b>※ 금융투자상품(펀드, 신탁 등) 가입 시 유의사항</b>
        <ul>
          <li>투자상품은 예금자보호법에 따라 보호되지 않습니다.</li>
          <li>투자상품은 운용실적에 따라 이익 또는 손실이 발생할 수 있으며 그 결과는 투자자에게 귀속됩니다.</li>
          <li>정해진 환매(중도해지)수수료 징수기간 이내에 환매(중도해지)하는 경우 환매(중도해지)수수료가 발생할 수 있습니다.</li>
          <li>가입을 결정하시기 전에 투자대상, 투자위험, 환매(중도해지) 방법 및 보수 등에 관하여 (간이)투자설명서 또는 운용자산설명서를 반드시 읽어보시기 바랍니다.</li>
          <li>기타 비용의 발생 여부 등에 따라 실제 투자자가 부담하는 보수 및 비용이 달라질 수 있습니다.</li>
          <li>과거 운용 실적이 미래의 수익을 보장하지 않습니다.</li>
        </ul>
      </div>
      </article>
    </section>
  );
}
