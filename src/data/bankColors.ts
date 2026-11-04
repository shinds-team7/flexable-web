// 비교 그래프에서 회사를 알아보기 쉽게 칠하는 회사별 대표 색(시그니처 컬러). 공시 회사 이름에 키워드가 들어 있으면 그 색을 쓴다.
// 토큰 밖 색이지만 "회사 구분"이 목적이라 여기에만 모은다. 목록에 없는 회사(저축은행 등)는 undefined라 호출한 쪽이 기본 계열 색으로 대신한다.
// 정확한 CI 값은 각 사 브랜드 가이드로 확인해 바꾼다.
const BANK_COLORS: { key: string; color: string }[] = [
  { key: '국민', color: '#FFB800' },
  { key: '신한', color: '#0046FF' },
  { key: '하나', color: '#009490' },
  { key: '우리', color: '#0067AC' },
  { key: '농협', color: '#1AA65C' },
  { key: '기업', color: '#0072BC' },
  { key: '카카오', color: '#F5C400' },
  { key: '토스', color: '#0064FF' },
  { key: '케이뱅크', color: '#6A2CFF' },
  { key: '부산', color: '#E60012' },
  { key: '경남', color: '#E4002B' },
  { key: '광주', color: '#00A0E9' },
  { key: '전북', color: '#0A3C8C' },
  { key: '제주', color: '#F58220' },
  { key: '수협', color: '#0072CE' },
  { key: '제일', color: '#0473EA' },
  { key: '씨티', color: '#056DAE' },
  { key: '대구', color: '#00A0A0' },
  { key: 'iM', color: '#00A0A0' },
  { key: '산업', color: '#003D7D' },
];

export function bankColor(company: string): string | undefined {
  return BANK_COLORS.find((b) => company.includes(b.key))?.color;
}
