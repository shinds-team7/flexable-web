// 투자 시뮬레이션(과거 시장 연습·가상 시뮬레이션·대회 판) 재생 속도. 서버가 주는 구간(frames)은 그대로 두고 화면이 그리는 간격만 바꾼다.
// 설정은 저장하지 않는다(새로고침하면 1배).

/** 1배일 때 시작·사건 사이 한 구간을 거래일 수와 관계없이 이 시간에 재생한다 */
export const SEGMENT_MS = 3000;
export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = typeof SPEEDS[number];

/** 고른 속도로 한 구간을 재생하는 시간(ms) */
export const segmentMs = (speed: Speed) => SEGMENT_MS / speed;
/** 안내 문구용 초. 0.5배 → "6", 2배 → "1.5" */
export const segmentSeconds = (speed: Speed) => String(segmentMs(speed) / 1000);

export function PlaybackSpeed({ speed, onChange }: { speed: Speed; onChange: (speed: Speed) => void }) {
  return <div className="practice-speed" role="group" aria-label="재생 속도">
    {SPEEDS.map(s => <button key={s} type="button" className={speed === s ? 'selected' : ''} aria-pressed={speed === s} onClick={() => onChange(s)}
      aria-label={`${s}배 속도, 구간당 ${segmentSeconds(s)}초`}>{s}배</button>)}
  </div>;
}
