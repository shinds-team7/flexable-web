// 0(또는 이전 값)부터 최종값까지 올라가는 숫자. 스크린 리더에는 최종값만 읽힌다.
import { useCountUp } from '@/lib/motion';

export function CountUp({ value, format, duration, decimals }: { value: number; format: (n: number) => string; duration?: number; decimals?: number }) {
  const shown = useCountUp(value, { duration, decimals });
  return (
    <>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden="true">{format(shown)}</span>
    </>
  );
}
