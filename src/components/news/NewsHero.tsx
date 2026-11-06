// 소식 화면 맨 위: 조건으로 찾기(30초 진단)로 가는 링크. 검색창은 전체 소식 목록 위의 NewsSearch에 있다.
type Props = { onGoConditions: () => void };

export function NewsHero({ onGoConditions }: Props) {
  return (
    <div className="news-hero">
      <h1 className="sr-only">청년 금융 소식</h1>
      <button type="button" className="news-hero-link" onClick={onGoConditions}>
        뭘 받을지 모르겠다면 30초 진단 <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
