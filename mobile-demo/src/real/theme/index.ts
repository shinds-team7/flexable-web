/**
 * 텅장관리 디자인 시스템 v2 — "하루치 지갑"
 *
 * 한 줄 원칙: 화면에서 가장 큰 것은 언제나 '오늘 쓸 수 있는 돈' 하나뿐.
 * 강조색은 신한 블루 하나. 누를 수 있는 것·선택된 것·오늘에만 쓰고, 나머지는 흰 면·연회색 바탕·네이비 잉크로 정리한다.
 *
 * - 색: 신한 블루 #0046FF 하나 + 흰 면/연회색 바탕 + 네이비 잉크. 빨강은 예산 초과·오류에만.
 * - 글꼴: Pretendard 한 벌. 본문·입력 16. 금액은 항상 tabular-nums(자릿수 정렬).
 * - 형태: 반경은 8(칩·아이콘 바탕)과 12(카드·히어로·버튼·입력) 두 단계. 카드는 미세 그림자(elevation1).
 *   토스트·다이얼로그·시트는 기존 모양을 유지해 역할 반경(toast·dialog·sheet)을 따로 둔다.
 * - 터치: 최소 48, 행·탭 56, 하단 고정 CTA 56.
 * - 모션: ease-out(0.23,1,0.32,1), 300ms 이하. 사용자가 누른 것에만 반응한다.
 * 시안: https://claude.ai/artifact/1mmbGZNgazLQ3p5AqvNfCY (디자인 토큰·컴포넌트 규격 보드)
 */
import { Easing, Platform, type TextStyle } from 'react-native';

export const colors = {
  /** 신한 블루 — 행동·선택·오늘. 앱에서 쓰는 파랑은 이 계열뿐이다 */
  brand: '#0046FF',
  /** 눌림 */
  brandDark: '#0034C2',
  /** 아이콘 바탕·선택된 칸·보조 버튼 */
  brandSoft: '#EBF0FF',
  /** 블루 위 글자 */
  onBrand: '#FFFFFF',
  onBrandSub: 'rgba(255,255,255,0.86)',

  /** 바탕 — 연회색 화면 위에 흰 면 */
  bg: '#F4F6FA',
  card: '#FFFFFF',
  sunken: '#EDF0F5',
  /** 캐릭터 홈 무대 */
  stage: '#EEF2FA',
  /** 구분선·비선택 칸 테두리 */
  line: '#E3E7EE',
  /** 입력 칸 1px 테두리, 스위치·라디오 꺼짐 (흰 바탕 3:1 이상) */
  borderInput: '#8A93A5',

  /** 잉크 — 네이비 계열 (흰 바탕 대비: text 17.2 · textSub 8.0 · textMuted 5.5) */
  text: '#101A33',
  textSub: '#475069',
  textMuted: '#5F697E',
  /** 장식 전용 (본문에 쓰지 않음) */
  textFaint: '#A6AEC0',
  /** 입력 placeholder (흰 바탕 4.5:1 이상) */
  placeholder: '#6B7488',

  positive: '#0B8A5B',
  positiveSoft: '#E5F6EE',
  warn: '#B95E00',
  warnSoft: '#FFF2E0',
  danger: '#D92D20',
  dangerSoft: '#FDECEA',
};

/** 반경. sm·soft가 기본 두 단계이고, toast·dialog·sheet는 기존 피드백 층 모양을 유지하는 역할 값이다 */
export const radius = { sm: 8, soft: 12, toast: 14, dialog: 24, sheet: 28, pill: 999 };

/** 4pt 간격. 화면 좌우 여백은 gutter */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, gutter: 20 };

/** 터치 영역 */
export const touch = { min: 48, row: 56, cta: 56 };

/** 타입 스케일 (px) — 12 탭 라벨 / 13 설명 / 14 보조 / 16 본문·입력 / 18 제목 / 24 금액 / 38 히어로 */
export const type = { tab: 12, caption: 13, meta: 14, body: 16, title: 18, amount: 24, display: 38 };

export const font = Platform.select({
  web: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  default: 'Pretendard-Regular',
});

export function fontForWeight(weight: string | number = '400') {
  if (Platform.OS === 'web') return font;
  const n = Number(weight === 'bold' ? 700 : weight);
  return n >= 800 ? 'Pretendard-ExtraBold' : n >= 700 ? 'Pretendard-Bold' : n >= 600 ? 'Pretendard-SemiBold' : n >= 500 ? 'Pretendard-Medium' : 'Pretendard-Regular';
}

/** 굵기별 로컬 파일을 직접 선택하고 네이티브의 합성 굵기·시스템 글꼴 대체를 막는다. */
export function fontStyle(weight: TextStyle['fontWeight'] = '400'): TextStyle {
  return {
    fontFamily: fontForWeight(weight),
    fontWeight: Platform.OS === 'web' ? weight : 'normal',
  };
}

/** 모션 토큰 — emil-design-eng 기준 */
export const motion = {
  /** 강한 ease-out: 시작이 빠르고 끝이 부드럽다 */
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  easeInOut: Easing.bezier(0.77, 0, 0.175, 1),
  cssEaseOut: 'cubic-bezier(0.23, 1, 0.32, 1)',
  press: 140,
  /** 스위치·라디오 전환 */
  toggle: 160,
  enter: 280,
  exit: 200,
  number: 420,
};

/** 웹 TextInput 포커스 테두리 제거 (대신 컨테이너가 포커스 상태를 표시) */
export const noOutline = Platform.select({ web: { outlineStyle: 'none' } as object, default: {} });

/** 카드에 까는 미세 그림자. RN 0.76+ 새 아키텍처는 boxShadow를 네이티브에서도 그린다 */
export const elevation1 = { boxShadow: '0 1px 2px rgba(16,26,51,0.06), 0 2px 8px rgba(16,26,51,0.05)' };
/** 떠 있는 레이어(시트·다이얼로그·+ 버튼)에만 쓰는 그림자 */
export const floating = Platform.select({
  web: { boxShadow: '0 12px 40px rgba(16,26,51,0.18)' } as object,
  default: { elevation: 8 },
});

/** 눌렀을 때 살짝 줄어드는 피드백 (웹은 CSS transition, 네이티브는 즉시) */
export const pressTransition = Platform.select({
  web: {
    transitionProperty: 'transform, background-color, opacity',
    transitionDuration: `${motion.press}ms`,
    transitionTimingFunction: motion.cssEaseOut,
  } as object,
  default: {},
});
