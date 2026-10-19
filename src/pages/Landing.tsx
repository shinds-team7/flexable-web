// 랜딩(와이어프레임 그대로). 예시 차트는 빌드에 포함된 예시 데이터로 그린다.
import { useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '@/auth/session';
import { TimeChart } from '@/charts/TimeChart';
import { Footer } from '@/components/Layout';
import { N, simulateSample } from '@/data/sampleMarket';
import { SocialButtons } from './Login';

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

export default function Landing() {
  const { status } = useSession();
  const navigate = useNavigate();
  const sim = useMemo(() => simulateSample({ amount: 470000, how: 'lump', startIdx: 0 }), []);
  if (status === 'member') return <Navigate to="/home" replace />;

  const placeHint = (wrap: HTMLDivElement) => {
    if (seen()) return;
    const pin = wrap.querySelector<HTMLElement>('.pin.rise:not(.cluster)') || wrap.querySelector<HTMLElement>('.pin');
    if (!pin) return;
    const note = document.createElement('div');
    note.className = 'handnote';
    note.textContent = '핀에 마우스를 올려 보세요';
    wrap.append(note);
    note.style.left = Math.max(0, parseFloat(pin.style.left) - note.offsetWidth - 14) + 'px';
    note.style.top = parseFloat(pin.style.top) - note.offsetHeight - 6 + 'px';
  };
  const demo = '/invest?demo=1';

  return (
    <section>
      <div className="page" style={{ paddingTop: 16 }}>
        <div className="land-hero">
          <div>
            <figure className="cat-ph" style={{ margin: '0 0 40px', color: 'var(--text-muted)', background: 'none', border: 0 }}>
              <img src="/characters/lv3-3.png" alt="" width={120} height={120} style={{ objectFit: 'contain' }} />
            </figure>
            <h1 className="display">아낀 돈, 그때 굴렸다면 얼마였을까?</h1>
            <p className="lead">앱에서 하루 예산을 지켜 모은 돈으로 지난 주식·적금을 실험해 봐요. 진짜 돈은 움직이지 않아요.</p>
            <div className="cta-stack">
              <SocialButtons />
              <Link className="btn-text" to={demo} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                로그인 없이 체험하기
              </Link>
            </div>
          </div>
          <div className="card card-hero">
            <div className="card-head" style={{ marginBottom: 8 }}>
              <div>
                <h2>2020년 1월, 47만 원을 예시 반도체주에 한 번에</h2>
                <p className="meta">예시 데이터예요. 실제 주가가 아니에요.</p>
              </div>
              <span className="tag-ex">예시</span>
            </div>
            <TimeChart
              label="예시 차트: 2020년 1월부터 지금까지 내 자산 변화와 사건 핀"
              sim={sim}
              from={0}
              to={N - 1}
              mode="total"
              height={300}
              compact
              afterDraw={placeHint}
              onHover={() => {
                document.querySelector('.handnote')?.remove();
                markSeen();
              }}
              onSelect={(id) => navigate(`${demo}&event=${id}`)}
              onZoom={() => navigate(demo)}
            />
            <div className="legend" style={{ marginTop: 8 }}>
              <span>
                <i style={{ color: 'var(--text)' }} />내 자산
              </span>
              <span>
                <i className="dash" style={{ color: 'var(--baseline)' }} />넣은 돈
              </span>
              <span>
                <span className="ev-ic rise" style={{ display: 'inline-grid', width: 14, height: 14, fontSize: 7, verticalAlign: 'middle', marginRight: 4 }}>▲</span>크게 오른 때
              </span>
              <span>
                <span className="ev-ic fall" style={{ display: 'inline-grid', width: 14, height: 14, fontSize: 7, verticalAlign: 'middle', marginRight: 4 }}>▼</span>크게 내린 때
              </span>
            </div>
          </div>
        </div>

        <h2 className="sec-title" style={{ marginBottom: 16 }}>앱에서 모으고, 웹에서 굴려봐요</h2>
        <div className="flow">
          <div>
            <span className="n">1</span>
            <h3>앱에서 오늘 쓸 돈 지키기</h3>
            <p className="sub" style={{ marginTop: 6, fontSize: 14 }}>입력한 잔액·수입일·고정지출로 하루 예산을 계산해요. 지키면 고양이가 한 단계씩 부자가 돼요.</p>
          </div>
          <div>
            <span className="n">2</span>
            <h3>월급 주기마다 남긴 돈이 시드머니로</h3>
            <p className="sub" style={{ marginTop: 6, fontSize: 14 }}>정산 주기가 끝날 때 수입에서 지출을 뺀 돈이 쌓여요. 계좌 연결 없이, 입력한 기록 기준으로 계산해요.</p>
          </div>
          <div>
            <span className="n">3</span>
            <h3>웹에서 주식·적금으로 실험</h3>
            <p className="sub" style={{ marginTop: 6, fontSize: 14 }}>그 돈을 지난 날짜로 보내 보고, 크게 오르내린 때엔 이유까지 읽어요.</p>
          </div>
        </div>

        <div className="feat">
          <div>
            <h2>주식 타임머신</h2>
            <p>"2020년 1월에 넣었다면 지금 얼마?"를 내 시드머니로 계산해요. 그래프의 ▲▼ 핀에 마우스를 올리면 그때 무슨 일이 있었는지, 누르면 왜 움직였는지 알려줘요.</p>
            <Link className="btn btn-soft" style={{ marginTop: 20 }} to={demo}>
              예시로 해보기
            </Link>
          </div>
          <div className="sketch" aria-hidden="true">
            <div className="bar-ph" style={{ width: '40%' }} />
            <div className="bar-ph" style={{ width: '70%', height: 18 }} />
            <svg viewBox="0 0 300 90" style={{ width: '100%', height: 'auto' }}>
              <polyline points="0,70 40,62 60,80 90,55 130,40 160,58 200,35 240,45 300,20" fill="none" strokeWidth="2" style={{ stroke: 'var(--text)' }} />
              <line x1="0" y1="66" x2="300" y2="66" strokeDasharray="4 4" style={{ stroke: 'var(--baseline)' }} />
              <circle cx="60" cy="94" r="6" style={{ fill: 'var(--fall)' }} />
              <circle cx="90" cy="40" r="6" style={{ fill: 'var(--rise)' }} />
            </svg>
          </div>
        </div>
        <div className="feat flip">
          <div>
            <h2>적금 비교</h2>
            <p>같은 돈을 적금에 넣었다면 만기에 얼마를 받는지, 기본금리·최고금리·기간으로 정렬해요. 광고로 순서를 바꾸지 않아요.</p>
            <Link className="btn btn-soft" style={{ marginTop: 20 }} to="/savings?demo=1">
              예시로 해보기
            </Link>
          </div>
          <div className="sketch" aria-hidden="true">
            <div className="bar-ph" style={{ width: '30%' }} />
            <div className="bar-ph" />
            <div className="bar-ph" style={{ width: '85%' }} />
            <div className="bar-ph" style={{ width: '92%' }} />
            <div className="bar-ph" style={{ width: '76%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <div style={{ height: 12, width: '80%', background: 'var(--s1)', borderRadius: '0 4px 4px 0' }} />
              <div style={{ height: 12, width: '62%', background: 'var(--s2)', borderRadius: '0 4px 4px 0' }} />
              <div style={{ height: 12, width: '20%', background: 'var(--baseline)', borderRadius: '0 4px 4px 0' }} />
            </div>
          </div>
        </div>
        <div className="feat">
          <div>
            <h2>오늘의 청년 금융 소식</h2>
            <p>교통·주거·금융·일자리처럼 당장 돈을 아끼거나 받을 수 있는 소식을 매일 골라요. 마감이 가까운 건 먼저 보여주고, 공고문으로 바로 가요.</p>
            <Link className="btn btn-soft" style={{ marginTop: 20 }} to="/news">
              소식 보기
            </Link>
          </div>
          <div className="sketch" aria-hidden="true">
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="dday">D-3</span>
              <span className="tag">교통</span>
            </div>
            <div className="bar-ph" style={{ width: '80%', height: 14 }} />
            <div className="bar-ph" style={{ width: '55%' }} />
            <div className="hair" style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="dday calm">상시</span>
              <span className="tag">주거</span>
            </div>
            <div className="bar-ph" style={{ width: '70%', height: 14 }} />
          </div>
        </div>

        <div className="card card-hero" style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 22, lineHeight: '30px' }}>무료로 충분히, 더 깊게는 월 990원 플러스</h2>
            <p className="sub" style={{ marginTop: 6 }}>사건 설명·기간 지정·정책 적금은 무료. 플러스는 정책 마감 리마인더·내 돈 리포트·정밀 모드·저장 확대예요.</p>
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
            <p>지난 주가로 해보는 계산이에요. 사고파는 기능은 없고, 어떤 종목도 권하지 않아요.</p>
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
