// 랜딩. 예시 차트는 빌드에 포함된 예시 데이터로 그린다. 기능 소개 이미지는 운영 화면 캡처(public/landing/screens),
// 앱 소개 목업 화면은 시연 앱(/m) 캡처와 앱 스플래시 이미지(public/landing/app)다.
import { useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { placePinNote, removePinNote } from '@/charts/pinNote';
import { TimeChart } from '@/charts/TimeChart';
import { Footer, PLAY_URL } from '@/components/Layout';
import { N, sampleChartData, simulateSample } from '@/data/sampleMarket';
import { useReveal, useSmoothWheel } from '@/lib/motion';

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

type Feature = { to: string; img: string; name: string; head: string; desc: string; cta: string };

/** 화면별 소개. 링크는 모두 로그인 없이 체험할 수 있는 화면이다. 투자 인사이트는 예시 차트와 함께 따로 그린다 */
const TYPE: Feature = { to: '/type', img: 'type', name: '내 투자 성향', head: '나에게 맞는 비율부터\n차근차근 알아봐요', desc: '질문 10개로 가까운 성향을 참고로 보고, 직접 골라요. 고른 성향의 패시브·액티브 비율과 지난 3년 결과, 흔히 담는 상품 유형을 보여 줘요.', cta: '성향 알아보기' };
const INVEST: Feature = { to: '/invest?demo=1', img: 'invest', name: '투자 인사이트', head: '지난 주가 위의 ▲▼ 핀으로\n그때 무슨 일이 있었는지', desc: '국내 지수·채권지수·금·환율 흐름과 시가총액·업종별 순위, 종목 3개까지 지난 주가를 견줘요. ▲▼ 핀을 누르면 그때 나온 공시와 AI 개요를 읽어요.', cta: '예시로 보기' };
const REST: Feature[] = [
  { to: '/simulation', img: 'sim', name: '투자 시뮬레이션', head: '지난 시장으로 들어가\n사건마다 직접 판단해 봐요', desc: '업종을 고르면 종목 하나를 무작위로 골라 지난 시세를 하루씩 재생해요. 공시가 나오면 멈추고 매수·유지·매도를 골라 봐요. 실제 주문은 없어요.', cta: '시뮬레이션 해보기' },
  { to: '/savings?demo=1', img: 'savings', name: '예적금 모아보기', head: '같은 금액, 같은 기간으로\n만기 수령액을 한눈에', desc: '금융권 공시 적금과 청년 정책 적금을 같은 금액 기준 만기 수령액으로 비교해요. 광고로 순서를 바꾸지 않아요.', cta: '적금 비교하기' },
  { to: '/goal', img: 'goal', name: 'AI 계획 수립', head: '목표까지 가는 길,\n세 가지 방법으로 견줘 봐요', desc: '목표 금액과 기한, 투자 성향을 고르면 세 가지 조합의 달성 가능성과 위험 수준을 함께 보여 줘요. 추정치이고 수익이나 달성을 보장하지 않아요.', cta: '목표 세워 보기' },
  { to: '/news', img: 'news', name: '청년 금융 소식', head: '놓치기 쉬운 청년 정책,\n마감 가까운 순으로', desc: '교통·주거·금융·일자리 소식을 매일 아침 공공 출처에서 모아 AI로 요약해요. 마감 가까운 순으로 보여 주고 공고문으로 바로 가요.', cta: '소식 보기' },
];

/** 오른쪽 위 화살표가 든 원 아이콘(테두리 버튼용) */
const ArrowCircle = () => (
  <svg viewBox="0 0 28 28" aria-hidden="true">
    <path d="M14.0007 2.33203C7.56065 2.33203 2.33398 7.5587 2.33398 13.9987C2.33398 20.4387 7.56065 25.6654 14.0007 25.6654C20.4407 25.6654 25.6673 20.4387 25.6673 13.9987C25.6673 7.5587 20.4407 2.33203 14.0007 2.33203ZM16.194 13.462L10.4073 19.2487L8.76232 17.6037L14.549 11.817L12.064 9.33203L18.6557 9.3437L18.6673 15.9354L16.194 13.462Z" />
  </svg>
);

/** 브라우저 창 틀 안의 화면 캡처 */
function ScreenFrame({ f, className = '' }: { f: Feature; className?: string }) {
  return (
    <div className={`land-show-frame ${className}`}>
      <div className="land-show-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <img src={`/landing/screens/${f.img}.webp`} alt={`${f.name} 화면`} loading="lazy" width={1440} height={794} />
    </div>
  );
}

function ShowCopy({ f, head = true }: { f: Feature; head?: boolean }) {
  return (
    <>
      {head && <h3 className="land-show-head">{f.head}</h3>}
      <p className="land-show-name">{f.name}</p>
      <p className="land-show-desc">{f.desc}</p>
      <Link className="land-show-cta" to={f.to}>
        <span>{f.cta}</span>
        <ArrowCircle />
      </Link>
    </>
  );
}

function Show({ f, flip }: { f: Feature; flip: boolean }) {
  return (
    <section className={`land-show${flip ? ' flip' : ''}`}>
      <div className="land-show-copy reveal">
        <ShowCopy f={f} />
      </div>
      <div className="reveal reveal-late">
        <ScreenFrame f={f} />
      </div>
    </section>
  );
}

/** 앱 소개의 휴대폰 목업. 화면 이미지만 바꿔 끼운다 */
function Phone({ src, alt, side }: { src: string; alt: string; side: 'left' | 'center' | 'right' | 'solo' }) {
  return (
    <div className={`land-iphone ${side}`}>
      <div className="land-iphone-body">
        <img src={src} alt={alt} loading="lazy" />
        <span className="land-iphone-island" aria-hidden="true" />
      </div>
    </div>
  );
}

/** 앱 소개 배경 무늬(장식) */
function AppPattern() {
  return (
    <svg className="land-app-bg" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="var(--color-land-line)" strokeWidth="2">
        <circle cx="300" cy="90" r="22" />
        <circle cx="60" cy="430" r="26" />
        <circle cx="1210" cy="95" r="20" />
        <circle cx="170" cy="560" r="16" />
        <rect x="140" y="-40" width="70" height="250" rx="35" transform="rotate(45 175 85)" />
        <rect x="1260" y="200" width="70" height="300" rx="35" transform="rotate(45 1295 350)" />
        <path d="M1010 40 l40 -40 l40 40" strokeLinejoin="round" />
      </g>
      <g fill="var(--color-brand-subtle)">
        <rect x="-20" y="380" width="90" height="420" rx="45" transform="rotate(45 25 590)" />
        <rect x="1080" y="-80" width="90" height="360" rx="45" transform="rotate(45 1125 100)" />
        <rect x="1230" y="420" width="110" height="360" rx="55" transform="rotate(45 1285 600)" />
      </g>
      <g fill="var(--color-land-sky-bottom)" opacity=".55">
        <circle cx="110" cy="70" r="7" />
        <circle cx="1050" cy="70" r="6" />
        <circle cx="1310" cy="70" r="8" />
        <circle cx="1350" cy="300" r="16" />
        <circle cx="1300" cy="450" r="8" />
      </g>
      <g fill="var(--color-brand-primary)" opacity=".18">
        <circle cx="1160" cy="520" r="5" />
      </g>
    </svg>
  );
}

/** Google Play 다운로드 버튼(단색 아이콘) */
function PlayBadge() {
  return (
    <a className="land-play" href={PLAY_URL} target="_blank" rel="noreferrer">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.2 2.3c-.3.3-.5.8-.5 1.4v16.6c0 .6.2 1.1.5 1.4l9.3-9.7-9.3-9.7zm10.6 8.4 2.9-3-11-6.3 8.1 9.3zm0 2.6-8.1 9.3 11-6.3-2.9-3zm4.4-4.7-3.2 3.4 3.2 3.4 3.6-2.1c1-.6 1-2 0-2.6l-3.6-2.1z" />
      </svg>
      <span>
        <b>Google Play에서</b>
        <small>다운로드</small>
      </span>
    </a>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const root = useRef<HTMLElement>(null);
  const chart = useMemo(() => sampleChartData(simulateSample({ amount: 470000, how: 'lump', startIdx: 0 })), []);
  useSmoothWheel();
  useReveal(root);

  const placeHint = (wrap: HTMLDivElement) => {
    if (!seen()) placePinNote(wrap);
  };
  const demo = '/invest?demo=1';

  return (
    <section ref={root}>
      <div className="land-sky">
        <div className="land-sky-in">
          <div className="land-copy">
            <h1 className="land-display">{'청년을 위한 금융 파트너\n솔파와 함께 성장하세요'}</h1>
            <span className="land-lead">청년들의 자산 증식을 도울 수 있도록, 정확한 금융 정보와 인사이트를 제공합니다.</span>
            <Link className="land-cta" to="/mypage">
              <span>체험 시작하기</span>
              <ArrowCircle />
            </Link>
          </div>
        </div>
        <button
          type="button"
          className="land-scroll"
          aria-label="아래로 스크롤"
          onClick={() => root.current?.querySelector('.land-app')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span className="land-scroll-txt">scroll</span>
          <span className="land-scroll-arrows" aria-hidden="true">
            <span>»</span>
          </span>
        </button>
      </div>

      <div className="land-app">
        <AppPattern />
        <div className="land-app-in">
          <div className="land-app-copy reveal">
            <p className="land-app-kicker">{'오늘 쓸 돈을 지키는\n가장 쉬운 방법'}</p>
            <h2 className="land-app-name">텅장관리</h2>
            <PlayBadge />
          </div>
          <div className="land-phones reveal reveal-late">
            <Phone side="left" src="/landing/app/splash.webp" alt="텅장관리 앱 시작 화면" />
            <Phone side="center" src="/landing/app/home.webp" alt="텅장관리 앱 홈 화면(예시 데이터)" />
            <Phone side="right" src="/landing/app/tx.webp" alt="텅장관리 앱 거래 내역 화면(예시 데이터)" />
          </div>
        </div>
      </div>

      <div className="land-shows">
        <Show f={TYPE} flip={false} />

        <section className="land-show land-show-invest">
          <div className="land-inv-img reveal">
            <ScreenFrame f={INVEST} />
          </div>
          <div className="land-inv-chart reveal reveal-late">
            <h3 className="land-show-head">{INVEST.head}</h3>
            <div className="card card-hero land-inv-card">
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
                height={280}
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
          <div className="land-inv-copy land-show-copy reveal">
            <ShowCopy f={INVEST} head={false} />
          </div>
        </section>

        {REST.map((f, i) => (
          <Show key={f.to} f={f} flip={i % 2 === 0} />
        ))}
      </div>

      <div className="land-wide">
        <div className="land-plus">
          <div>
            <h2>무료로 충분히, 더 깊게는 월 990원 플러스</h2>
            <p>소식, 투자 시뮬레이션의 사건 설명, 적금·정책 적금 비교는 무료예요. 저장 개수 확대·정밀 모드·리마인더·리포트가 플러스예요. 지금은 모의 결제라 실제 청구는 없어요.</p>
          </div>
          <Link className="btn btn-line" to="/plus">
            플러스 알아보기
          </Link>
        </div>
      </div>

      <div className="land-dl">
        <svg className="land-dl-bg" viewBox="0 0 1440 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g fill="none" stroke="var(--color-land-glass-line)" strokeWidth="1.5" opacity=".6">
            <circle cx="70" cy="40" r="40" />
            <circle cx="70" cy="40" r="60" />
            <circle cx="70" cy="40" r="80" />
            <circle cx="70" cy="40" r="100" />
            <circle cx="1350" cy="210" r="30" />
            <circle cx="1350" cy="210" r="50" />
            <circle cx="1350" cy="210" r="70" />
            <circle cx="1350" cy="210" r="90" />
          </g>
          <g fill="var(--color-land-glass)">
            <rect x="-80" y="150" width="200" height="200" rx="60" />
            <circle cx="110" cy="70" r="26" />
            <circle cx="1420" cy="70" r="34" />
            <circle cx="1290" cy="230" r="24" />
            <path d="M1330 200a120 120 0 0 1 240 0z" />
          </g>
        </svg>
        <div className="land-dl-in">
          <div className="land-dl-copy reveal">
            <h2>앱 다운로드</h2>
            <p>텅장관리로 오늘 쓸 돈부터 지켜 보세요</p>
            <PlayBadge />
          </div>
          <div className="land-dl-phone reveal reveal-late">
            <span className="land-dl-halo" aria-hidden="true" />
            <Phone side="solo" src="/landing/app/splash.webp" alt="텅장관리 앱 시작 화면" />
          </div>
        </div>
      </div>

      <div className="land-wide land-foot">
        <Footer />
      </div>
    </section>
  );
}
