// 선 그래프가 왼쪽부터 그려지듯 드러나게 하는 SVG clipPath. 감싼 선만 드러나고 축·점은 그대로다.
// replayKey가 바뀌면(기간 전환 등) 다시 그린다. 움직임 줄이기를 켜면 애니메이션 없이 바로 보인다.
import { useId, type ReactNode } from 'react';

export function RevealClip({ width, height, replayKey, children }: { width: number; height: number; replayKey?: string | number; children: ReactNode }) {
  const id = 'reveal' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <>
      <defs>
        <clipPath id={id}>
          <rect key={replayKey} className="reveal-rect" x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
}
