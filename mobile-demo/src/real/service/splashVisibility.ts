// The home screen can mount while the native splash is still covering it.
// Start entrance animations only after the splash has actually been hidden.
let hidden = false;
const listeners = new Set<() => void>();

export function afterSplashHidden(callback: () => void) {
  if (hidden) callback();
  else listeners.add(callback);
  return () => { listeners.delete(callback); };
}

export function markSplashHidden() {
  if (hidden) return;
  hidden = true;
  for (const callback of listeners) callback();
  listeners.clear();
}
