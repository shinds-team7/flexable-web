// 랜딩(와이어프레임 그대로). 예시 차트는 빌드에 포함된 예시 데이터로 그린다.
import { useMemo, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { placePinNote, removePinNote } from '@/charts/pinNote';
import { TimeChart } from '@/charts/TimeChart';
import { Footer } from '@/components/Layout';
import { LANDING_ART } from '@/data/landingArt';
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

/** 히어로 일러스트: 유리 질감 도형·원 단위 코인·예시 시드머니 카드. 장식이라 스크린리더에는 숨긴다 */
function HeroArt() {
  const A = LANDING_ART;
  // 각 자리는 위아래로 둥실 떠다니는 래퍼(.art)이고, 안에는 data/landingArt.ts의 이미지 또는 임시 그림이 들어간다
  const slot = (key: 'logo' | 'coin1' | 'coin2' | 'coin3', fallback: ReactNode) => (
    <div className={`art art-${key}`}>{A[key].src ? <img src={A[key].src} alt="" /> : fallback}</div>
  );
  return (
    <div className="land-art" aria-hidden="true">
      {slot(
        'logo',
        <svg className="land-glass" viewBox="0 0 400 400">
          <g transform="rotate(32 200 200)">
            <rect x="70" y="70" width="260" height="260" rx="30" fill="var(--color-land-glass)" stroke="var(--color-land-glass-line)" strokeWidth="3" />
            <rect x="112" y="112" width="176" height="176" rx="18" fill="none" stroke="var(--color-land-glass-line)" strokeWidth="2" />
          </g>
          <polyline points="104,262 156,222 196,244 252,170 296,138" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
        </svg>,
      )}
      {slot('coin1', <span className="coin">₩</span>)}
      {slot('coin2', <span className="coin">₩</span>)}
      {slot('coin3', <span className="coin">₩</span>)}
      {/* 폰 틀과 그 위 카드는 떠다니지 않는다. 폰 틀 자리에는 나중에 앱 화면 이미지를 넣는다 */}
      <div className="art-device">
        <div className="art-phone">
          {A.phone.src ? (
            <img src={A.phone.src} alt="" />
          ) : (
            <div className="land-phone">
              <span className="land-phone-notch" />
            </div>
          )}
        </div>
        <div className="art-card">
          {A.card.src ? (
            <img src={A.card.src} alt="" />
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}

/** 화면별 소개 카드. 링크는 모두 로그인 없이 체험할 수 있는 화면이다 */
const FEATURES = [
  { to: '/type', title: '내 투자 성향', desc: '질문 10개로 가까운 성향을 참고로 보고, 직접 골라요. 고른 성향의 패시브·액티브 비율과 지난 3년 결과, 흔히 담는 상품 유형을 보여 줘요.', cta: '성향 알아보기' },
  { to: '/invest?demo=1', title: '투자 인사이트', desc: '국내 지수·채권지수·금·환율 흐름과 시가총액·업종별 순위, 종목 3개까지 지난 주가를 견줘요. ▲▼ 핀을 누르면 그때 나온 공시와 AI 개요를 읽어요.', cta: '예시로 보기' },
  { to: '/simulation', title: '투자 시뮬레이션', desc: '고른 종목에 금액을 넣어 지난 날짜부터 흘려 보고, 크게 오르내린 구간을 재생하며 그 이유를 읽어요.', cta: '시뮬레이션 해보기' },
  { to: '/savings?demo=1', title: '예적금 모아보기', desc: '금융권 공시 적금과 청년 정책 적금을 같은 금액 기준 만기 수령액으로 비교해요. 광고로 순서를 바꾸지 않아요.', cta: '적금 비교하기' },
  { to: '/goal', title: 'AI 계획 수립', desc: '목표 금액과 기한을 정하면 매달 얼마를 남기면 되는지 계산하고, AI가 내 숫자로 실천 단계를 안내해요(하루 3회 무료).', cta: '목표 세워 보기' },
  { to: '/news', title: '청년 금융 소식', desc: '교통·주거·금융·일자리 소식을 매일 아침 공공 출처에서 모아 AI로 요약해요. 마감 가까운 순으로 보여 주고 공고문으로 바로 가요.', cta: '소식 보기' },
];

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
            <p className="land-kicker">
              청년들의 자산 증식을 도울 수 있도록,
              <br />
              정확한 정보와 투자의 인사이트를!
            </p>
            <h1 className="land-display">
              솔파와 함께
              <br />
              금융 정보를 빠르게 얻고
              <br />
              함께 성장하세요
            </h1>
            <Link className="land-cta" to="/home">
              체험 시작하기
            </Link>
          </div>
          <HeroArt />
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
        <div className="land-feats">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="land-feat">
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <span className="land-feat-cta">{f.cta} →</span>
            </Link>
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
