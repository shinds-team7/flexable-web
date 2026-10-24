// 액티브 투자란?(시안). 액티브 카테고리의 입구: 개념 세 가지 → 투자 시뮬레이션 → 두 방식 비교 → 반반 실험.
// 설계는 docs/product/proposal-active-passive.md. 종목 판단·전망 문장은 쓰지 않는다(01 §7 R1).
import { LinkCards, MixCard, ProtoNote, WaysTable } from '@/components/Proto';

const IDEAS = [
  {
    h: '사람이 몰리면 내 몫이 줄어요',
    p: '모두가 아는 소식은 이미 가격에 들어가 있을 때가 많아요. 액티브는 남들과 다른 판단으로 시장 평균보다 나은 결과를 노리는 방식이에요.',
  },
  {
    h: '무엇을, 언제',
    p: '어떤 종목을 언제 넣었느냐가 결과를 크게 바꿔요. 같은 기간이라도 고른 종목에 따라 크게 늘기도, 크게 줄기도 해요.',
  },
  {
    h: '그때 무슨 일이 있었나',
    p: '가격이 크게 움직인 날의 공시·가격 변화를 사건 핀으로 짚어 보며, 내 판단이 어땠을지 연습해요.',
  },
];

export default function Active() {
  return (
    <section>
      <div className="page col">
        <ProtoNote />
        <div className="card ways-hero">
          <span className="tag">액티브 투자</span>
          <h1 className="page-title">골라서 투자</h1>
          <p className="sub">종목을 직접 고르고, 언제 넣을지 정하는 방식이에요. 날아갈 수 있는 만큼만 비율을 정해 두고 시작하는 사람이 많아요.</p>
        </div>
        <div className="idea-cards">
          {IDEAS.map((it, i) => (
            <div key={it.h} className="card idea-card">
              <span className="idea-no num">{i + 1}</span>
              <h2>{it.h}</h2>
              <p className="sub">{it.p}</p>
            </div>
          ))}
        </div>
        <h2 className="sec-title">액티브 투자에서 해 볼 수 있는 것</h2>
        <LinkCards
          items={[
            { to: '/invest', title: '투자 시뮬레이션', desc: '고른 종목에 넣었다면 어땠는지, 그때 무슨 일이 있었는지 사건 핀으로 봐요.' },
          ]}
        />
        <WaysTable side="active" />
        <MixCard />
      </div>
    </section>
  );
}
