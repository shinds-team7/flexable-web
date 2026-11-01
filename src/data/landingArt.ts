// 랜딩 히어로 일러스트 자리. src를 채우면 그 이미지가 CSS/SVG 임시 그림을 대신한다.
// 이미지는 public/landing/ 에 넣고 '/landing/coin-1.png'처럼 적는다(투명 배경 PNG·WebP 권장). 위치·크기는 global.css의 .land-art 아래 클래스.
export const LANDING_ART = {
  logo: { src: '/landing/home-icon.webp' as string | null }, // 큰 3D 아이콘(유리 질감 로고 자리)
  coin1: { src: '/landing/coin-1.webp' as string | null }, // 왼쪽 아래 기울어진 코인
  coin2: { src: '/landing/coin-2.webp' as string | null }, // 버튼 뒤 뒷면 코인
  coin3: { src: '/landing/coin-3.webp' as string | null }, // 오른쪽 앞 코인
  coin4: { src: '/landing/coin-4.webp' as string | null }, // 오른쪽 뒤 코인
  phone: { src: null as string | null }, // 폰 틀(아이폰 + 우리 앱 화면). 떠다니지 않고 히어로·아래 섹션 경계에 걸친다
  card: { src: null as string | null }, // 폰 화면 위에 얹는 카드(앱 화면 속 카드 이미지). 비워 두면 임시 시드머니 카드가 나온다
};
