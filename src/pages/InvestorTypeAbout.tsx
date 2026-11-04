// /type/about: 투자성향분석이란? 금융 가이드형 단일 페이지(목차 + 본문 섹션).
// 그림은 public/type/about/ 에 파일을 넣으면 자동으로 보인다. 없으면 자리 표시 상자가 보이고, optional 그림은 숨긴다.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { INVESTOR_TYPES, TYPE_QUESTIONS } from '@/data/investorType';

const IMG = '/type/about';

const TOC = [
  { id: 'summary', label: '3줄 요약' },
  { id: 'what', label: '투자성향분석이란?' },
  { id: 'when', label: '언제 하나요?' },
  { id: 'steps', label: '대출 계획과 설문 항목' },
  { id: 'types', label: '투자성향, 어떻게 나뉘나요?' },
  { id: 'grades', label: '가입 가능한 상품 위험등급' },
  { id: 'faq', label: '자주 묻는 질문' },
  { id: 'here', label: '여기서는 이렇게 해요' },
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

        {/* 3줄 요약 */}
        <section className="ia-summary" aria-labelledby="summary">
          <h2 id="summary">3줄 요약</h2>
          <ol>
            <li>투자성향분석은 투자 상품에 가입하기 전 투자 목적·경험·자금 상황 등을 기준으로 개인이 감내할 수 있는 투자 위험 수준을 확인하는 절차예요.</li>
            <li>투자성향분석 결과에 따라 안정형부터 공격투자형까지 5가지로 유형이 나뉘고, 자신의 투자성향보다 높은 위험등급의 상품은 가입할 수 없어요.</li>
            <li>투자성향분석은 투자자 보호를 위해 대면, 비대면 관계없이 1일 1회로 제한되고, 당일 재분석은 불가능해요.</li>
          </ol>
        </section>

        <div className="ia-prose">
          <p>
            투자상품을 알아보다 보면 한 번쯤 이런 고민이 생겨요. 내 투자 성향은 어떤 편인지, 어느 정도의 위험까지 감당할 수 있는지, 안정적인 상품이 맞을지, 아니면 수익을 더 기대해도 될지 말이에요.
          </p>
          <p>
            이런 고민을 정리해 주는 과정이 바로 투자성향분석이에요. 투자성향분석은 본격적으로 투자상품에 가입하기 전에 감내할 수 있는 위험 수준을 점검하는 보호 장치예요. 오늘은 투자성향분석이 무엇인지부터 어떤 기준으로 유형을 나누는지, 그리고 분석 결과가 실제 투자에 어떻게 활용되는지까지 정리해 볼게요.
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
          <Cta>내 투자성향 알아보기</Cta>
        </section>

        {/* 투자성향분석 시기 */}
        <section className="ia-sec" aria-labelledby="when">
          <Head id="when" kicker="투자성향분석 시기" title="투자성향분석 언제 하나요?" />
          <div className="ia-prose">
            <p>
              투자성향분석은 원금 손실 가능성이 있는 상품에 가입하기 전에 진행해요. 기존에 투자성향분석 결과가 있더라도 일정 기간이 지났거나 투자 목적이나 자금 상황이 달라졌다면 다시 진행해야 해요.
            </p>
            <p>
              투자성향분석은 하루에 한 번만 할 수 있도록 제한돼 있어요. 짧은 시간 안에 여러 번 답변을 바꾸면 실제 투자 성향과 다른 결과가 나올 수 있기 때문이에요.
            </p>
          </div>
        </section>

        {/* 대출 계획·설문 */}
        <section className="ia-sec" aria-labelledby="steps">
          <Head id="steps" title="대출 계획과 설문 항목" />
          <div className="ia-step">
            <h3>
              최근 1개월 내 대출 계획 확인
            </h3>
            <p>
              금융소비자보호에 관한 법률에 따라, 금융투자상품에 가입한 뒤 1개월 이내에는 대출을 받기 어렵게 제한돼 있어요. 반대로 대출을 먼저 받은 경우에도 대출 실행일로부터 1개월이 지나야 금융투자상품에 가입할 수 있어요.
            </p>
            <p>그래서 금융회사는 고객의 투자 시점과 대출 계획이 겹치지 않는지, 가입 가능 여부를 미리 확인하기 위해 1개월 내 대출 계획이 있는지를 물어요.</p>
          </div>

          <div className="ia-step">
            <h3>
              투자성향 설문
            </h3>
            <p>금융소비자 유형과 취약소비자 해당 여부, 1개월 내 대출 계획 확인 후에 본격적으로 투자성향을 진단하기 위한 설문조사를 진행해요.</p>
            <div className="ia-box">
              <b>📌 KB국민은행 투자성향 진단 설문 항목</b>
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

        {/* 위험등급 */}
        <section className="ia-sec" aria-labelledby="grades">
          <Head id="grades" kicker="투자성향별" title="가입 가능한 상품 위험등급" />
          <div className="ia-prose">
            <p>
              투자성향분석 결과에 따라 가입할 수 있는 금융투자상품의 위험등급 범위가 정해져요. 이는 수익을 제한하기 위한 기준이 아니라, 투자자가 감당할 수 있는 위험 수준을 넘지 않도록 하기 위한 거예요.
            </p>
          </div>
          <div className="ia-step">
            <h3>금융투자상품 위험등급이란?</h3>
            <p>
              금융투자상품은 상품의 구조와 가격 변동성, 원금 손실 가능성 등을 기준으로 위험 수준을 등급으로 구분해요. 등급 숫자가 작을수록(1등급에 가까울수록) 위험도가 높고, 숫자가 클수록 위험도는 상대적으로 낮아져요.
            </p>
          </div>
          <div className="ia-step">
            <h3>투자성향별 가입 가능한 위험등급 범위</h3>
            <p>투자성향에 따라 선택할 수 있는 상품의 위험등급은 다음과 같아요.</p>
            <div className="ia-table-wrap">
              <table className="ia-table">
                <thead>
                  <tr>
                    <th scope="col">투자성향</th>
                    <th scope="col">적합상품 위험등급</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">안정형</th>
                    <td>6등급(매우 낮은 위험)</td>
                  </tr>
                  <tr>
                    <th scope="row">안정추구형</th>
                    <td>5등급(낮은 위험) 이하</td>
                  </tr>
                  <tr>
                    <th scope="row">위험중립형</th>
                    <td>4등급(보통위험) 이하</td>
                  </tr>
                  <tr>
                    <th scope="row">적극투자형</th>
                    <td>3등급(다소 높은 위험) 이하</td>
                  </tr>
                  <tr>
                    <th scope="row">공격투자형</th>
                    <td>1등급(매우 높은 위험), 2등급(높은 위험) 이하</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Figure name="risk-grade.png" alt="투자성향별로 가입할 수 있는 위험등급(6등급~1등급) 범위를 보여 주는 그림" wide optional />
            <div className="ia-prose">
              <p>
                자신의 투자성향보다 낮은 위험등급의 상품은 가입할 수 있지만, 높은 위험등급의 경우에는 손실 위험이 성향에 맞지 않아서 가입할 수 없어요.
              </p>
              <p>또, 같은 투자성향으로 분류되더라도 투자 경험, 손실 감내 수준, 투자 예정 기간에 따라 고난도금융투자상품은 가입이 제한될 수 있어요.</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="ia-sec" aria-labelledby="faq">
          <Head id="faq" kicker="투자성향분석" title="💬 자주 묻는 질문" />
          <dl className="ia-faq">
            <div>
              <dt>Q. 투자성향분석은 꼭 해야 하나요?</dt>
              <dd>네. 금융투자상품에 가입하려면 투자성향분석은 필수예요. 이는 법령에 따라 금융회사가 고객님의 투자자 정보를 파악하여 적합한 상품을 권유드리기 위한 절차예요.</dd>
            </div>
            <div>
              <dt>Q. 투자성향분석 결과 안정형으로 나왔어요. 펀드 가입 못 하나요?</dt>
              <dd>고객의 투자성향에 맞는 펀드 상품에 가입할 수 있어요. 위험등급이 6등급인 MMF(머니마켓펀드)나 단기채, 국공채 펀드 등 내 성향에 맞는 위험등급 상품만 가입 가능해요.</dd>
            </div>
            <div>
              <dt>Q. 투자성향분석을 다시 할 수 있나요?</dt>
              <dd>투자성향분석은 투자자 보호를 위해 대면, 비대면 관계없이 같은 날짜에 1일 1회로 제한돼요. 당일 재분석은 불가능합니다.</dd>
            </div>
            <div>
              <dt>Q. 투자상품에 가입할 때마다 투자성향분석을 다시 해야 하나요?</dt>
              <dd>네. 금융투자상품을 신규로 가입할 때마다 투자성향분석은 원칙적으로 다시 진행해야 해요. 다만, 최근 2년 이내에 실시한 설문 항목은 재사용 가능해요.</dd>
            </div>
            <div>
              <dt>Q. 투자성향분석 결과가 낮은 위험등급으로 나오면 불리한가요?</dt>
              <dd>
                투자성향분석 결과는 좋고 나쁨을 가르는 기준이 아니라, 내가 감수할 수 있는 위험의 범위를 알려주는 기준이에요. 결과가 낮은 위험등급으로 나오면 그에 맞는 안정적인 상품 위주로 안내를 받게 되고, 감수하기 어려운 높은 위험등급의 상품은 피할 수 있어요.
              </dd>
            </div>
            <div>
              <dt>Q. 전문금융소비자는 어떤 기준으로, 어떻게 등록하나요?</dt>
              <dd>
                전문금융소비자는 금융소비자보호법에 따라 금융상품에 관한 전문성 또는 소유자산 규모 등에 비추어 금융상품 계약에 따른 위험 감수 능력이 있는 금융소비자를 의미해요. 적합성, 적정성의 원칙, 설명의무 등의 적용 제외가 가능하고 은행 지점 방문을 통해 등록할 수 있어요. 다만, 전문금융소비자의 경우에도 일반금융소비자와 동일한 대우를 받고자 하는 경우 관계 법규에 따라 일반금융소비자로 전환이 가능해요.
              </dd>
            </div>
            <div>
              <dt>Q. 금융취약소비자에 해당되면 불이익이 있나요?</dt>
              <dd>
                아니에요. 금융투자상품에 대한 이해도가 낮거나 투자경험이 부족한 고객을 추가적으로 보호하기 위해 ‘금융취약소비자’ 해당 여부를 확인하는 거예요. 금융취약소비자에 해당되면 상품 상담에 앞서 「금융투자상품 가입 시 유의사항」에 대해 우선적으로 설명을 들을 수 있어요.
              </dd>
            </div>
          </dl>
          <ul className="ia-tags" aria-label="관련 주제">
            {['투자성향분석', '위험등급', '투자자유형', '투자상품', '펀드', '금융소비자유형', '투자목적', '주식', '투자성향변경'].map((t) => (
              <li key={t}>#{t}</li>
            ))}
          </ul>
          <Cta>나는 어떤 유형일까?</Cta>
        </section>

        {/* 이 서비스에서는 */}
        <section className="ia-sec" aria-labelledby="here">
          <Head id="here" kicker="Flex-able" title="여기서는 이렇게 해요" />
          <ul className="ia-list">
            <li>질문 {TYPE_QUESTIONS.length}개에 답하면 가까운 성향을 알려 드려요.</li>
            <li>결과는 참고용이에요. 성향은 내가 직접 정하고, 횟수 제한 없이 언제든 바꿀 수 있어요.</li>
            <li>질문에 답한 내용은 저장하지 않아요.</li>
            <li>
              여기서는 성향을 {INVESTOR_TYPES.length}가지로 나눠요: {INVESTOR_TYPES.map((t) => t.name).join(' · ')}. 패시브는 시장 전체(지수 ETF)를 꾸준히, 액티브는 종목을 직접 골라 넣는 방식이에요.
            </li>
          </ul>
          <p className="meta">
            이 분석은 금융회사의 투자자 적합성 진단을 대신하지 않고, 수익이나 달성을 보장하지 않아요. 위의 5가지 유형·1일 1회 제한은 금융회사의 투자성향분석 기준이고, 이 화면의 테스트에는 적용되지 않아요.
          </p>
          <div className="toolbar">
            <Link className="btn btn-primary" to="/type/test">
              테스트 시작
            </Link>
          </div>
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
