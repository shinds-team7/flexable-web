// 소식 화면의 글 「조건으로 찾기 입력 요령」(/news/guide). 조건으로 찾기가 실제로 하는 일만 적는다. 건수는 적지 않는다(조회 시점마다 다르다).
import { Link } from 'react-router-dom';
import { GUIDE_META } from '@/components/news/NewsAnalysis';

const FAQ = [
  {
    q: '고르는 조건이 많을수록 결과가 줄어드나요?',
    a: '아니요, 늘어나요. 고른 지역·나이·주제 중 하나라도 맞는 소식을 모두 보여 주는 합집합이라서요. 목록을 줄이고 싶으면 조건을 덜 고르거나 위 검색창에 낱말을 더하세요.',
  },
  {
    q: '지역을 고르지 않으면 어떻게 되나요?',
    a: '지역은 조건에서 빠져요. 나이나 주제만 골랐다면 그 조건에 맞는 소식이 지역과 상관없이 나와요.',
  },
  {
    q: '결과에 나온 지원금은 모두 받을 수 있나요?',
    a: '아니요. 결과는 받을 가능성이 있는 목록이에요. 소득·재산·거주 기간 같은 세부 자격은 각 소식의 공고문에서 확인해야 해요.',
  },
  {
    q: '고른 조건이 저장되나요?',
    a: '저장하지 않아요. 고른 지역·나이·주제는 이 화면에서 소식을 거르는 데만 쓰고 서버로 보내지 않아요. 새로 고침하면 처음 상태로 돌아가요.',
  },
];

export default function NewsGuide() {
  return (
    <section>
      <article className="page news-article" aria-labelledby="news-guide-h1">
        <img className="news-article-hero" src="/cal.png" alt="" />
        <Link to="/news" className="news-article-back">
          ‹ 청년 금융 소식
        </Link>
        <p className="news-guide-meta">
          <span className="tag">{GUIDE_META.tag}</span> <span className="meta">{GUIDE_META.date} 올림 · Flex-able 편집</span>
        </p>
        <h1 id="news-guide-h1" className="news-article-title">
          조건으로 찾기 입력 요령 — 여러 개 고르면 목록은 길어져요
        </h1>
        <p className="news-article-lead">
          조건으로 찾기는 지역·나이·관심 주제를 여러 개 눌러 두고 [검색하기]를 누르면, 고른 것 중 하나라도 맞는 소식을 모아 보여 줘요. 조건마다 하는 일과 목록을 줄이는
          순서를 정리했어요.
        </p>

        <h2>찾는 방식은 3가지</h2>
        <ul>
          <li>
            <b>지역</b>: 고른 시도의 소식과 전국 공통 소식을 함께 봐요. 지역을 확인하지 못한 소식은 처음부터 목록에 나오지 않아요.
          </li>
          <li>
            <b>나이</b>: 만 나이를 골라요. 그 나이가 소식의 신청 가능 나이(예: 만 19~34세)에 들면 나와요. 나이 조건을 원문에서 확인하지 못한 소식은 나이로는 잡히지 않아요.
          </li>
          <li>
            <b>관심 주제</b>: 교통·주거·금융·일자리·교육·생활·문화·세금·기타 중에서 골라요. 한 소식이 여러 주제에 들 수 있어요.
          </li>
        </ul>
        <p>신청 기간이 지난 소식은 조건과 상관없이 목록에서 빠져요.</p>

        <h2>합집합이라 이렇게 움직여요</h2>
        <div className="news-article-table" role="region" aria-label="고른 조건에 따른 결과" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">고른 조건</th>
                <th scope="col">보이는 소식</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>아무것도 안 고름</td>
                <td>신청 기간이 지나지 않은 소식 전체</td>
              </tr>
              <tr>
                <td>서울</td>
                <td>서울 소식 + 전국 공통 소식</td>
              </tr>
              <tr>
                <td>서울, 부산</td>
                <td>서울 소식 + 부산 소식 + 전국 공통 소식</td>
              </tr>
              <tr>
                <td>서울, 만 30세</td>
                <td>서울·전국 소식에, 만 30세가 신청 나이에 드는 소식을 더한 것</td>
              </tr>
              <tr>
                <td>서울, 주거</td>
                <td>서울·전국 소식에, 주거 주제 소식을 더한 것</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>목록이 너무 길면 줄이는 순서</h2>
        <ol>
          <li>처음에는 조건을 하나만 고르고 결과를 봐요. 주제가 가장 좁혀져요.</li>
          <li>위 검색창에 낱말(예: 월세, 면접)을 넣으면 조건으로 찾은 결과 안에서 한 번 더 걸러져요. 검색어는 조건과 함께 적용돼요.</li>
          <li>정렬을 마감 임박순으로 두고 위에서부터 신청 기간을 확인해요.</li>
          <li>관심 가는 소식은 책갈피를 눌러 저장해 두세요. 저장한 소식은 마이페이지에서 볼 수 있어요.</li>
        </ol>

        <h2>신청 전 확인할 것</h2>
        <ul>
          <li>
            <b>세부 자격</b>: 소득·재산·거주 기간 조건은 소식마다 달라요. 공고문에서 지원대상과 신청방법을 읽어 주세요.
          </li>
          <li>
            <b>신청 기간</b>: 마감일이 없는 소식은 상시 모집이라는 뜻이 아닐 수 있어요. 카드에 상시로 표시된 것만 상시 모집이에요.
          </li>
          <li>
            <b>최종 확인</b>: 금액과 조건은 사업을 운영하는 기관의 공고가 기준이에요. 이 화면은 온통청년 공개 정책 자료를 모아 보여 줘요.
          </li>
        </ul>
        <p className="meta">
          공고문 보기를 누르면 어떤 소식이 열렸는지만 익명 값으로 세어 &lsquo;요즘 핫한 청년 소식&rsquo;에 써요. 이름·계정과 이어지지 않고 30일 뒤 지워져요.
        </p>

        <h2>자주 묻는 질문</h2>
        <dl className="news-faq">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
        <p className="meta">제도와 금액은 나라 예산이나 법이 바뀌면 달라져요. 신청하기 전에 담당 기관에서 한 번 더 확인해 주세요.</p>
      </article>
    </section>
  );
}
