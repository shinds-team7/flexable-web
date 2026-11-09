// 투자 시뮬레이션 아래 글 「공시 읽는 법」(/simulation/guide, Issue #367). 공시의 뜻·제목·숫자·유형별 확인할 것과 이 서비스에서 공시가 보이는 방식만 적는다.
// 항목과 뜻만 쓰고 판단을 대신하는 말은 쓰지 않는다(decisions/2026-11-05-virtual-sim-contest 2-2, 2026-11-09-placement-ai-summary v2).
// backend PlacementGuideTextTest가 이 파일과 data/simulationGuide.ts에 금지 표현이 없는지 검사한다.
// 배치고사를 푸는 중이거나 대회 판이 진행 중이면 본문 대신 안내만 보인다(대회 결정 "변경 기록 11-09 #367").
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { CATEGORY_GUIDE } from '@/data/placementGuide';
import { placementInProgress } from '@/data/placementMark';
import { TYPE_CHECKS } from '@/data/simulationGuide';
import { getMyContests } from '@/data/virtualContest';

const SIZE_BANDS = ['10억 원 미만', '10억~50억 원', '50억~100억 원', '100억~500억 원', '500억~1천억 원', '1천억~5천억 원', '5천억~1조 원', '1조 원 이상'];

type Gate = 'checking' | 'open' | 'locked';

/**
 * 열람 제한. 비회원은 바로 본문. 회원은 /me/virtual-sim/contests의 진행 중인 판(activeRound)을 보고, 배치고사는 이 브라우저의 표시(placementMark)로 본다.
 * 내 대회 기록을 불러오지 못하면 판 확인은 건너뛰고 배치고사 표시만 본다.
 */
function useGate(): Gate {
  const { status } = useSession();
  const [gate, setGate] = useState<Gate>('checking');
  useEffect(() => {
    if (status === 'loading') return;
    if (placementInProgress()) { setGate('locked'); return; }
    if (status === 'guest') { setGate('open'); return; }
    let alive = true;
    setGate('checking');
    getMyContests()
      .then(me => { if (alive) setGate(me.current?.activeRound ? 'locked' : 'open'); })
      .catch(() => { if (alive) setGate('open'); });
    return () => { alive = false; };
  }, [status]);
  return gate;
}

export default function SimulationGuide() {
  const gate = useGate();
  return (
    <section>
      <article className="page news-article" aria-labelledby="sim-guide-h1" aria-busy={gate === 'checking'}>
        <Link to="/simulation" className="news-article-back">
          ‹ 투자 시뮬레이션
        </Link>
        <p className="news-guide-meta">
          <span className="tag">시뮬레이션 가이드</span> <span className="meta">Flex-able 편집</span>
        </p>
        <h1 id="sim-guide-h1" className="news-article-title">
          공시 읽는 법 — 제목과 숫자에서 무엇을 보면 될까요
        </h1>
        {gate === 'checking' ? (
          <p className="news-article-lead" role="status">
            글을 여는 중…
          </p>
        ) : gate === 'locked' ? (
          <div role="status">
            <p className="news-article-lead">배치고사·대회 판이 끝난 뒤 볼 수 있어요.</p>
            <p>
              배치고사를 푸는 동안이나 대회 판을 하는 동안에는 이 글을 열 수 없어요. 제출하거나 판을 마친 뒤 다시 들어와 주세요. 배치고사는 시작하고 30분이 지나면 자동으로 채점돼요.
            </p>
            <p>
              <Link to="/simulation?mode=contest">대회 화면으로 돌아가기 ›</Link>
            </p>
          </div>
        ) : (
          <GuideBody />
        )}
      </article>
    </section>
  );
}

function GuideBody() {
  return (
    <>
      <p className="news-article-lead">
        투자 연습·가상 시뮬레이션·대회에서는 공시를 읽고 선택해요. 공시가 무엇인지, 제목과 숫자를 어떻게 읽는지, 유형마다 어떤 항목을 보면 되는지 정리했어요. 이 글은 항목과 뜻만 적었어요.
        공시 뒤 시세가 어느 쪽으로 움직일지, 숫자가 크고 작은 것이 좋은지 나쁜지는 적지 않았어요. 그 판단은 직접 해 보세요.
      </p>

      <h2>공시란</h2>
      <ul>
        <li>
          <b>공시</b>: 상장회사가 투자 판단에 영향을 줄 수 있는 사실을 모든 투자자에게 같은 때에 알리는 일이에요. 법과 거래소 규정이 무엇을 언제까지 알려야 하는지 정해 두어서, 회사가
          알리고 싶을 때만 내는 글이 아니라 의무예요.
        </li>
        <li>
          <b>DART</b>(전자공시시스템): 금융감독원이 운영하는 공시 사이트예요. 회사가 낸 공시 원문을 누구나 볼 수 있어요.
        </li>
        <li>
          <b>OpenDART</b>: DART의 공시를 프로그램으로 받을 수 있게 연 서비스예요. 이 서비스는 OpenDART에서 공시 목록·주요사항보고서의 주요 정보·공시 원문을 받아요.
        </li>
      </ul>

      <h2>제목 읽기</h2>
      <p>공시 제목에는 보고서 이름과 무슨 일인지, 그리고 정정·자율 같은 표시가 함께 붙어요.</p>
      <div className="news-article-table" role="region" aria-label="공시 제목에 붙는 이름과 표시" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">제목에서 보이는 것</th>
              <th scope="col">뜻</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>주요사항보고서(유상증자결정)</td>
              <td>
                증자·사채 발행·자기주식 취득과 처분·합병과 분할처럼 법이 정한 중요한 결정을 했을 때 내는 보고서예요. 괄호 안이 결정한 내용이에요. 이 서비스의 <b>공시 주요 내용</b>은 이
                보고서에만 있어요.
              </td>
            </tr>
            <tr>
              <td>단일판매·공급계약체결, 현금·현물배당결정, 최대주주변경 등</td>
              <td>거래소 규정에 따라 그때그때 내는 <b>거래소 수시공시</b>예요. 공급 계약·배당·최대주주 변경·소송·시설 투자 같은 일이 여기에 들어요.</td>
            </tr>
            <tr>
              <td>(공정공시)</td>
              <td>일부에게만 먼저 알려질 수 있는 정보(잠정 실적 등)를 모든 투자자에게 같은 때 알리는 공시예요.</td>
            </tr>
            <tr>
              <td>(자율공시)</td>
              <td>꼭 알려야 하는 크기는 아니지만 회사가 스스로 알리는 공시예요.</td>
            </tr>
            <tr>
              <td>(종속회사의주요경영사항)</td>
              <td>
                이 회사가 아니라 이 회사가 지배하는 종속회사(자회사)가 결정한 일을 이 회사가 대신 알리는 공시예요. 금액과 % 같은 숫자는 종속회사를 기준으로 적혀 있을 수 있어요.
              </td>
            </tr>
            <tr>
              <td>[기재정정]</td>
              <td>
                이미 낸 공시의 내용을 고친 <b>정정 공시</b>예요. 무엇을 왜 고쳤는지와 고치기 전·후가 함께 나와요. 정정 공시는 원래 공시와 따로 나오므로, 같은 제목이 두 번 보이면 앞에
                [기재정정]이 붙었는지 봐요. [첨부정정]·[첨부추가]는 첨부 서류만 고치거나 더한 것이에요.
              </td>
            </tr>
            <tr>
              <td>~결정 / ~결과보고서</td>
              <td>결정은 하기로 정했다는 알림이고, 결과보고서(예: 자기주식취득결과보고서)는 마친 뒤 실제로 한 만큼을 알리는 서류예요.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>숫자 읽기</h2>
      <ul>
        <li>
          <b>규모 구간</b>: 금액을 그대로 보여 주면 회사를 찾아낼 수 있어서, 이 서비스는 금액을 아래 8개 구간으로 묶어 보여 줘요. 아래 경계는 구간에 들어가요. 예를 들어
          &lsquo;100억~500억 원&rsquo;은 100억 원 이상 500억 원 미만이에요.
          <div className="sim-guide-bands" aria-label="규모 구간 8개">
            {SIZE_BANDS.map((b) => (
              <span key={b} className="tag">
                {b}
              </span>
            ))}
          </div>
        </li>
        <li>
          <b>자기자본 대비 %</b>: 금액 ÷ 자기자본이에요. 자기자본은 회사 자산에서 빚(부채)을 뺀 회사 자기 몫의 돈이에요. 자기자본 1,000억 원인 회사의 50억 원 소송이면 5%예요. 회사
          크기가 달라도 견줘 볼 수 있어요.
        </li>
        <li>
          <b>매출액 대비 %</b>: 계약 금액 ÷ 최근 사업연도 매출액이에요. 한 해 매출이 2,000억 원인 회사가 300억 원 계약을 맺으면 15%예요. 계약 기간이 여러 해라면 그 금액이 기간에 걸쳐
          나뉘어 들어와요.
        </li>
        <li>
          <b>발행 주식 대비 %</b>: 새로 발행하거나 사들이는 주식 수 ÷ 이미 발행된 주식 총수예요. 유상증자·무상증자·자기주식·사채에서 쓰여요. 3%면 주식 100주 가운데 3주만큼이에요.
        </li>
        <li>
          <b>지분율</b>: 한 주주(와 특수관계인)가 가진 주식 ÷ 발행 주식 총수예요. 최대주주 변경·다른 회사 지분 취득에서 쓰여요.
        </li>
        <li>
          <b>증감률</b>: (이번 값 − 견준 값) ÷ 견준 값이에요. 실적 공시에서는 전년 같은 기간과 바로 앞 분기, 두 가지와 견준 값이 나와요. 견준 값이 손실이면 증감률 대신 흑자 전환·적자
          지속처럼 적어요.
        </li>
        <li>
          <b>잠정 실적과 확정 실적</b>: 잠정 실적은 외부 감사인의 감사(분기·반기는 검토)를 받기 전에 회사가 집계한 숫자예요. 확정 실적은 감사·검토를 거쳐 사업보고서·분기보고서에 실리는
          숫자예요. 둘은 다를 수 있어요.
        </li>
        <li>
          <b>기간 길이</b>: 계약 기간·취득 기간처럼 &lsquo;18개월&rsquo;·&lsquo;2년간&rsquo;으로 적힌 길이예요. 이 서비스는 날짜는 숨기고 길이만 보여 줘요.
        </li>
      </ul>

      <h2>유형별로 확인할 것</h2>
      <p>유형마다 공시가 무엇인지와 판단 재료가 되는 항목을 적었어요.</p>
      <div className="sim-guide-types">
        {TYPE_CHECKS.map((t) => (
          <section key={t.category} className="sim-guide-type" aria-labelledby={`sim-guide-${t.category}`}>
            <h3 id={`sim-guide-${t.category}`}>{t.name}</h3>
            <p className="sim-guide-type-desc">{CATEGORY_GUIDE[t.category]}</p>
            <dl>
              {t.checks.map((c) => (
                <div key={c.item}>
                  <dt>{c.item}</dt>
                  <dd>{c.meaning}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <h2>이 서비스에서 공시가 보이는 방식</h2>
      <ul>
        <li>
          <b>과거 시장 연습</b>: 실제 종목의 실제 공시 제목이 나오고, 원문 링크로 DART 원문을 볼 수 있어요.
        </li>
        <li>
          <b>가상 시뮬레이션·대회 판</b>: 가상 종목의 가상 사건이에요. 사건 제목은 실제 공시 제목 형식이고, 회사 이름·소개·사건 글은 AI가 만들었고 사람이 검수하지 않았어요.
        </li>
        <li>
          <b>배치고사</b>: 실제 과거 공시가 나와요. 답을 밖에서 찾아보지 못하게 회사 이름·접수일·절대 금액은 빼고, 업종·유형·제목·유형 설명과 함께 공시 AI 요약이나 공시 주요 내용을
          보여 줘요.
        </li>
        <li>
          <b>공시 AI 요약</b>: AI가 공시 원문을 읽고 정리한 글이에요. 사람이 검수하지 않았어요. 회사를 알아보지 못하게 이름·날짜와 정확한 금액은 빼고, 금액은 규모 구간으로, 수량은 원문에 적힌
          기존 대비 %로만 적어요.
        </li>
        <li>
          <b>공시 주요 내용</b>: 주요사항보고서에 담긴 주요 정보에서 서버가 만든 % 값·규모 구간·정해 둔 분류 이름이에요(최대 4개). 요약이 없을 때 보여요. 둘 다 없으면 유형 설명만 보여요.
        </li>
        <li>
          <b>배치고사 결과</b>: 문제마다 회사 이름·접수일과 그 뒤 5거래일 실제 움직임을 보여 줘요. 회사 이름과 날짜로 DART에서 원문을 찾아볼 수 있어요.
        </li>
      </ul>
      <p className="meta">
        배치고사를 푸는 동안이나 대회 판을 하는 동안에는 이 글을 열 수 없어요. 공시의 뜻과 기준은 법과 거래소 규정이 바뀌면 달라질 수 있어요. 이 글은 어떤 매매도 권하지 않아요.
      </p>
    </>
  );
}
