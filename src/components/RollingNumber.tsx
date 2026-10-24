// 슬롯처럼 도는 숫자. 자리마다 0~9 띠가 함께 돌다가 앞자리부터 하나씩 멈춰 최종값을 보여 준다(홈 시드머니).
// 값이 바뀌면(직접 수정 등) 다시 돈다. 움직임 줄이기를 켜면 global.css 규칙으로 전환이 꺼져 바로 최종값이 보인다.
// 스크린 리더에는 최종값 한 번만 읽히고, 띠는 숨긴다.
import { useEffect, useState } from 'react';
import { won } from '@/lib/format';

const SPIN_MS = 700; // 첫 자리가 멈추기까지
const STAGGER_MS = 110; // 다음 자리가 멈추기까지 더 도는 시간
const DIGITS = '0123456789';

export function RollingNumber({ value }: { value: number }) {
  const text = won(value);
  const [go, setGo] = useState(false);

  useEffect(() => {
    setGo(false);
    // 띠를 0 위치로 돌려놓은 뒤 다음 프레임에 출발시킨다.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setGo(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [text]);

  let digitIdx = 0;
  return (
    <span className="roll">
      <span className="sr-only">{text}</span>
      <span className="roll-reels" aria-hidden="true">
        {[...text].map((ch, i) => {
          if (!/\d/.test(ch)) {
            return (
              <span key={i} className="roll-sep">
                {ch}
              </span>
            );
          }
          const k = digitIdx++;
          const loops = 2 + k; // 뒷자리일수록 더 오래 돌아 앞자리부터 멈춘다
          const stop = loops * 10 + Number(ch);
          return (
            <span key={`${text}-${i}`} className="roll-reel">
              <span
                className="roll-strip"
                style={{
                  transform: `translateY(calc(${go ? -stop : 0} * var(--roll-h)))`,
                  transition: go ? `transform ${SPIN_MS + k * STAGGER_MS}ms cubic-bezier(.15,.75,.3,1.08)` : 'none',
                }}
              >
                {DIGITS.repeat(loops + 1)
                  .split('')
                  .map((d, j) => (
                    <span key={j}>{d}</span>
                  ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
