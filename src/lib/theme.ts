// 화면 테마. 기본은 라이트이고 시스템 설정은 따르지 않는다. 사용자가 다크를 고르면 그때만 다크.
import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'fx.theme';

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(t: Theme) {
  if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* 저장 못 하면 이번 방문에만 적용 */
  }
}

export function useTheme() {
  const [theme, set] = useState<Theme>(readTheme);
  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    set(t);
  }, []);
  return { theme, setTheme };
}
