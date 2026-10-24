// 패시브 투자란?(시안). 패시브 카테고리의 입구: 개념 세 가지 → 하위 기능 → 두 방식 비교 → 반반 실험.
// 설계는 docs/product/proposal-active-passive.md. '추천·투자하세요' 같은 말은 쓰지 않는다(01 §7-2).
import { LinkCards, MixCard, ProtoNote, WaysTable } from '@/components/Proto';

const IDEAS = [
  {
    h: '많은 사람이 가 있는 곳에 같이',
    p: '지수는 시장 전체를 한 바구니에 담아요. 종목을 고르는 실력보다 시장 평균을 따라가는 게 목표예요. 그래서 사람이 많이 모인 곳일수록 같이 가는 방식이에요.',
  },
  {
    h: '3~5년, 한 바퀴를 겪기',
    p: '지난 기록을 보면 시장이 크게 줄었다가 돌아오기까지 몇 년이 걸린 때가 있었어요. 그래서 패시브는 기간을 길게 잡고, 그 사이의 오르내림을 과정으로 봐요.',
  },
  {
    h: '구조를 먼저 만들기',
    p: '같은 돈이라도 어느 계좌에 넣느냐에 따라 떼는 세금이 달라져요. 월급이 흘러갈 길을 한 번 정해 두면 매달 신경 쓸 일이 줄어요.',
  },
];

export default function Passive() {
  return (
    <section>
      <div className="page col">
        <ProtoNote />
        <div className="card ways-hero">
          <span className="tag">패시브 투자</span>
          <h1 className="page-title">시장 전체에 꾸준히</h1>
          <p className="sub">종목을 고르지 않고, 시장 전체를 담은 지수를 정해진 금액으로 매달 사 두는 방식이에요.</p>
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
        <h2 className="sec-title">패시브 투자에서 해 볼 수 있는 것</h2>
        <LinkCards
          items={[
            { to: '/passive/index', title: '지수 시뮬레이션', desc: '지수에 매달 넣었다면 얼마나 줄었다가 언제 돌아왔는지 봐요.' },
            { to: '/passive/plan', title: '계좌 설계', desc: '월급이 은행 → CMA → ISA·연금으로 흘러가는 길을 단계별로 봐요.' },
            { to: '/passive/accounts', title: '계좌 알아보기', desc: 'CMA·ISA·연금저축·IRP·금현물을 같은 항목으로 나란히 봐요.' },
            { to: '/savings', title: '적금 모아보기', desc: '쓸 날짜가 정해진 돈은 적금으로. 지금 상품과 정책 적금을 비교해요.' },
          ]}
        />
        <WaysTable side="passive" />
        <MixCard />
      </div>
    </section>
  );
}
