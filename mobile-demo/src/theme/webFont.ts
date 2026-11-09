/**
 * Pretendard Variable v1.3.9를 웹에 등록한다(SIL OFL 1.1, 원문은 public/fonts/LICENSE.txt).
 * 굵기 축 범위를 지정해야 합성 굵기 없이 그려지므로 expo-font 대신 @font-face를 직접 넣는다.
 */
if (typeof document !== "undefined") {
  // 개발 서버는 public을 baseUrl(/m) 없이 루트에서 제공한다.
  const base = __DEV__ ? "" : process.env.EXPO_BASE_URL ?? "";
  const style = document.createElement("style");
  style.textContent = `@font-face{font-family:"Pretendard Variable";font-weight:45 920;font-style:normal;font-display:swap;src:url("${base}/fonts/PretendardVariable.woff2") format("woff2")}`;
  document.head.appendChild(style);
}

export {};
