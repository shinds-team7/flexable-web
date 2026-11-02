// 랜딩(와이어프레임 그대로). 예시 차트는 빌드에 포함된 예시 데이터로 그린다.
import { useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { placePinNote, removePinNote } from '@/charts/pinNote';
import { TimeChart } from '@/charts/TimeChart';
import { Footer } from '@/components/Layout';
import { N, sampleChartData, simulateSample } from '@/data/sampleMarket';

const HINT_KEY = 'fx.landHint';
const seen = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return true;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* 무시 */
  }
};

/** 크림 섹션의 예시 폰 화면과 그 위 시드머니 카드. 장식이라 스크린리더에는 숨긴다 */
function PhoneMock() {
  return (
    <div className="land-device" aria-hidden="true">
      <div className="land-phone">
        <span className="land-phone-notch" />
      </div>
      <div className="land-device-card">
        <div className="land-mock">
          <div className="land-mock-head">
            <span className="land-mock-tag">예시</span>
            <span className="land-mock-badge">체험 중</span>
          </div>
          <p className="land-mock-title">내 시드머니</p>
          <p className="land-mock-amount num">
            470,000<small>원</small>
          </p>
          <svg viewBox="0 0 200 48" className="land-mock-line">
            <polyline points="0,40 30,34 60,38 90,24 120,26 150,12 200,6" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="land-mock-meta">예시 데이터예요. 실제 내 돈이 아니에요.</p>
        </div>
      </div>
    </div>
  );
}

/** 화면별 소개. 이미지는 운영 화면 캡처(public/landing/screens). 링크는 모두 로그인 없이 체험할 수 있는 화면이다 */
const FEATURES = [
  { to: '/type', img: 'type', name: '내 투자 성향', head: '나에게 맞는 비율부터\n차근차근 알아봐요', desc: '질문 10개로 가까운 성향을 참고로 보고, 직접 골라요. 고른 성향의 패시브·액티브 비율과 지난 3년 결과, 흔히 담는 상품 유형을 보여 줘요.', cta: '성향 알아보기' },
  { to: '/invest?demo=1', img: 'invest', name: '투자 인사이트', head: '지난 주가 위의 ▲▼ 핀으로\n그때 무슨 일이 있었는지', desc: '국내 지수·채권지수·금·환율 흐름과 시가총액·업종별 순위, 종목 3개까지 지난 주가를 견줘요. ▲▼ 핀을 누르면 그때 나온 공시와 AI 개요를 읽어요.', cta: '예시로 보기' },
  { to: '/simulation', img: 'sim', name: '투자 시뮬레이션', head: '지난 시장으로 들어가\n사건마다 직접 판단해 봐요', desc: '업종을 고르면 종목 하나를 무작위로 골라 지난 시세를 하루씩 재생해요. 공시가 나오면 멈추고 매수·유지·매도를 골라 봐요. 실제 주문은 없어요.', cta: '시뮬레이션 해보기' },
  { to: '/savings?demo=1', img: 'savings', name: '예적금 모아보기', head: '같은 금액, 같은 기간으로\n만기 수령액을 한눈에', desc: '금융권 공시 적금과 청년 정책 적금을 같은 금액 기준 만기 수령액으로 비교해요. 광고로 순서를 바꾸지 않아요.', cta: '적금 비교하기' },
  { to: '/goal/demo', img: 'goal', name: 'AI 계획 수립', head: '목표까지 가는 길,\n세 가지 방법으로 견줘 봐요', desc: '목표 금액과 기한, 투자 성향을 고르면 세 가지 조합의 달성 가능성과 위험 수준을 함께 보여 줘요. 추정치이고 수익이나 달성을 보장하지 않아요.', cta: '목표 세워 보기' },
  { to: '/news', img: 'news', name: '청년 금융 소식', head: '놓치기 쉬운 청년 정책,\n마감 가까운 순으로', desc: '교통·주거·금융·일자리 소식을 매일 아침 공공 출처에서 모아 AI로 요약해요. 마감 가까운 순으로 보여 주고 공고문으로 바로 가요.', cta: '소식 보기' },
];

/** 오른쪽 위 화살표가 든 원 아이콘(테두리 버튼용) */
const ArrowCircle = () => (
  <svg viewBox="0 0 28 28" aria-hidden="true">
    <path d="M14.0007 2.33203C7.56065 2.33203 2.33398 7.5587 2.33398 13.9987C2.33398 20.4387 7.56065 25.6654 14.0007 25.6654C20.4407 25.6654 25.6673 20.4387 25.6673 13.9987C25.6673 7.5587 20.4407 2.33203 14.0007 2.33203ZM16.194 13.462L10.4073 19.2487L8.76232 17.6037L14.549 11.817L12.064 9.33203L18.6557 9.3437L18.6673 15.9354L16.194 13.462Z" />
  </svg>
);

export default function Landing() {
  const { status } = useSession();
  const navigate = useNavigate();
  const chart = useMemo(() => sampleChartData(simulateSample({ amount: 470000, how: 'lump', startIdx: 0 })), []);
  if (status === 'member') return <Navigate to="/home" replace />;

  const placeHint = (wrap: HTMLDivElement) => {
    if (!seen()) placePinNote(wrap);
  };
  const demo = '/invest?demo=1';

  return (
    <section>
      <div className="land-sky">
        <div className="land-sky-in">
          <div className="land-copy">
            <h1 className="land-display">{'청년을 위한 금융 파트너\n솔파와 함께 성장하세요'}</h1>
            <span className="land-lead">청년들의 자산 증식을 도울 수 있도록, 정확한 금융 정보와 인사이트를 제공합니다.</span>
          </div>
          <Link className="land-cta" to="/home">
            <span>체험 시작하기</span>
            <ArrowCircle />
          </Link>
        </div>
      </div>
      <div className="land-cream">
        <div className="land-cream-in">
          <div className="land-cream-copy">
            <h2>
              청년 금융 정보는 빠르게,
              <br />
              투자 인사이트는 쉽게
            </h2>
            <p>가입 없이 예시 데이터로 모든 화면을 둘러볼 수 있어요. 체험한 내용은 저장되지 않아요.</p>
            <Link className="btn btn-primary land-cream-btn" to="/invest?demo=1">
              투자 인사이트 둘러보기
            </Link>
          </div>
          <PhoneMock />
        </div>
      </div>
      <div className="page land">
        <div className="land-sub">
          <h2>아낀 돈을 그때 굴렸다면,</h2>
          <p>예시 차트로 먼저 보여 드려요</p>
        </div>
        <div className="land-hero chart-only">
          <div className="card card-hero">
            <div className="card-head">
              <div>
                <h2>2020년 1월, 47만 원을 예시 반도체주에 한 번에</h2>
                <p className="meta">예시 데이터예요. 실제 주가가 아니에요.</p>
              </div>
              <span className="tag-ex">예시</span>
            </div>
            <TimeChart
              label="예시 차트: 2020년 1월부터 지금까지 내 자산 변화와 사건 핀"
              data={chart}
              from={0}
              to={N - 1}
              mode="total"
              height={300}
              compact
              afterDraw={placeHint}
              onHover={() => {
                removePinNote();
                markSeen();
              }}
              onSelect={(id) => navigate(`${demo}&event=${id}`)}
              onZoom={() => navigate(demo)}
            />
            <div className="legend land-legend">
              <span>
                <i className="total" />내 자산
              </span>
              <span>
                <i className="dash base" />넣은 돈
              </span>
              <span>
                <span className="ev-ic rise">▲</span>크게 오른 때
              </span>
              <span>
                <span className="ev-ic fall">▼</span>크게 내린 때
              </span>
            </div>
          </div>
        </div>

        <h2 className="land-title land-title-gap">앱에서 모으고, 웹에서 굴려봐요</h2>
        <div className="flow">
          <div>
            <span className="n">1</span>
            <h3>앱에서 오늘 쓸 돈 지키기</h3>
            <p>입력한 잔액·수입일·고정지출로 하루 예산을 계산해요. 지키면 고양이가 한 단계씩 부자가 돼요.</p>
          </div>
          <div>
            <span className="n">2</span>
            <h3>월급 주기마다 남긴 돈이 시드머니로</h3>
            <p>정산 주기가 끝날 때 수입에서 지출을 뺀 돈이 쌓여요. 계좌 연결 없이, 입력한 기록 기준으로 계산해요.</p>
          </div>
          <div>
            <span className="n">3</span>
            <h3>웹에서 시드머니로 해보기</h3>
            <p>앱을 연동하면 그 돈을 그대로 불러와요. 투자 시뮬레이션·적금 비교·목표 계산에 쓰고, 연동하지 않아도 직접 금액을 넣어 볼 수 있어요.</p>
          </div>
        </div>

        <h2 className="land-title">웹에서 이런 걸 해볼 수 있어요</h2>
        <div className="land-shows">
          {FEATURES.map((f, i) => (
            <section key={f.to} className={`land-show${i % 2 ? ' flip' : ''}`}>
              <div className="land-show-copy">
                <h3 className="land-show-head">{f.head}</h3>
                <p className="land-show-name">{f.name}</p>
                <p className="land-show-desc">{f.desc}</p>
                <Link className="land-show-cta" to={f.to}>
                  <span>{f.cta}</span>
                  <ArrowCircle />
                </Link>
              </div>
              <div className="land-show-frame">
                <div className="land-show-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <img src={`/landing/screens/${f.img}.webp`} alt={`${f.name} 화면`} loading="lazy" width={1440} height={794} />
              </div>
            </section>
          ))}
        </div>

        <div className="land-plus">
          <div>
            <h2>무료로 충분히, 더 깊게는 월 990원 플러스</h2>
            <p>소식, 투자 시뮬레이션의 사건 설명, 적금·정책 적금 비교는 무료예요. 저장 개수 확대·정밀 모드·리마인더·리포트가 플러스예요. 지금은 모의 결제라 실제 청구는 없어요.</p>
          </div>
          <Link className="btn btn-line" to="/plus">
            플러스 알아보기
          </Link>
        </div>

        <div className="trust">
          <div>
            <h3>계좌 연결 없음</h3>
            <p>앱에 직접 입력한 잔액·거래로만 계산해요. 은행 비밀번호를 받지 않아요.</p>
          </div>
          <div>
            <h3>실제 투자 아님</h3>
            <p>지난 주가로 해보는 계산이에요. 사고팔거나 가입을 대신해 주는 기능은 없고, 수익이나 목표 달성을 보장하지 않아요.</p>
          </div>
          <div>
            <h3>출처를 밝혀요</h3>
            <p>주가·금리·소식마다 출처와 기준일을 적어요. AI가 정리한 문장엔 표시를 붙여요.</p>
          </div>
        </div>
        <Footer />
      </div>
    </section>
  );
}
