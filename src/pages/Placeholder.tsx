// 팀원이 채울 화면의 자리. 각 화면의 설계는 project2 docs/web/wireframes.html의 같은 이름 화면과 02-design.md를 따른다.
export default function Placeholder({ title, desc, wireframe }: { title: string; desc: string; wireframe: string }) {
  return (
    <section>
      <div className="page wip">
        <div className="card col" style={{ gap: 12 }}>
          <h1 className="page-title">{title}</h1>
          <p className="sub">{desc}</p>
          <p className="meta">준비 중인 화면이에요. 와이어프레임의 「{wireframe}」 화면을 기준으로 만들어요.</p>
        </div>
      </div>
    </section>
  );
}
