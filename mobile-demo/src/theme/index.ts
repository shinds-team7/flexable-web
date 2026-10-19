/**
 * 텅장관리 디자인 시스템 — "하루치 지갑"
 *
 * 한 줄 원칙: 화면에서 가장 큰 것은 언제나 '오늘 쓸 수 있는 돈' 하나뿐.
 * 나머지는 조용한 네이비 잉크와 얇은 선으로 정리하고, 신한 블루는 행동(버튼·선택·오늘)에만 쓴다.
 *
 * - 색: 신한 블루 #0046FF + 은행 네이비 잉크. 회색은 모두 푸른 기가 도는 쿨 그레이.
 * - 글꼴: Pretendard 한 벌. 금액은 항상 tabular-nums(자릿수 정렬).
 * - 형태: 위계에 따라 반경이 다르다(히어로 28 > 묶음 20 > 행 14 > 칩 pill). 그림자 대신 면 색으로 깊이를 표현.
 * - 모션: ease-out(0.23,1,0.32,1), 300ms 이하. 사용자가 누른 것에만 반응한다.
 */
import { Easing, Platform } from 'react-native';

export const colors = {
  /** 신한 블루 — 행동·선택·오늘 */
  brand: '#0046FF',
  brandDark: '#0034C2',
  brandDeep: '#002A9E',
  brandSoft: '#E8EEFF',
  brandSofter: '#F4F7FF',
  brandBorder: '#A9C0FF',
  /** 블루 위 글자 */
  onBrand: '#FFFFFF',
  onBrandSub: 'rgba(255,255,255,0.82)',

  /** 바탕 — 푸른 기 쿨 그레이 */
  bg: '#F3F5F9',
  card: '#FFFFFF',
  sunken: '#EEF1F6',
  line: '#E4E8F0',

  /** 잉크 — 은행 네이비 계열 (모두 흰 바탕 대비 4.5:1 이상, faint 제외) */
  text: '#101A33',
  textSub: '#475069',
  textMuted: '#646E84',
  /** 장식·비활성 전용 (본문에 쓰지 않음) */
  textFaint: '#A6AEC0',
  /** 입력 placeholder (흰 바탕 3:1 이상) */
  placeholder: '#868FA3',

  positive: '#0B8A5B',
  positiveSoft: '#E5F6EE',
  warn: '#B95E00',
  warnSoft: '#FFF2E0',
  danger: '#D92D20',
  dangerSoft: '#FDECEA',
  info: '#1F6FE0',
  infoSoft: '#EAF2FF',
};

/** 위계별 반경 */
export const radius = { xs: 8, sm: 12, md: 14, lg: 20, xl: 28, pill: 999 };

/** 4pt 간격 */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 };

/** 타입 스케일 (px) — 12 캡션 / 13 메타 / 15 본문 / 17 섹션 / 20 제목 / 28 금액 / 44 디스플레이 */
export const type = { caption: 12, meta: 13, body: 15, section: 17, title: 20, amount: 28, display: 44 };

export const font = Platform.select({
  web: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  default: undefined,
});

/** 모션 토큰 — emil-design-eng 기준 */
export const motion = {
  /** 강한 ease-out: 시작이 빠르고 끝이 부드럽다 */
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  easeInOut: Easing.bezier(0.77, 0, 0.175, 1),
  cssEaseOut: 'cubic-bezier(0.23, 1, 0.32, 1)',
  press: 140,
  enter: 280,
  exit: 200,
  number: 420,
};

/** 웹 TextInput 포커스 테두리 제거 (대신 컨테이너가 포커스 상태를 표시) */
export const noOutline = Platform.select({ web: { outlineStyle: 'none' } as object, default: {} });

/** 떠 있는 레이어(시트·다이얼로그)에만 쓰는 그림자. 카드에는 쓰지 않는다. */
export const shadow = Platform.select({ web: {} as object, default: {} });
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
export const pressed = { transform: [{ scale: 0.97 }] };
