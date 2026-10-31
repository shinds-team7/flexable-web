// 적금·예금 비교 화면이 같이 쓰는 부품: 고지 문구, 불러오는 중, 오류 카드, 맨 위로 버튼.
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icons';
import { ApiError, errorText } from '@/lib/api';

export function Notice({ text }: { text: string }) {
  return (
    <p className="disclaimer">
      <Icon id="i-info" size={14} />
      {text}
    </p>
  );
}

export function Assumptions({ items }: { items: string[] }) {
  return (
    <ul className="sv-assume">
      {items.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
}

export function Loading({ h = 240 }: { h?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="불러오는 중">
      <div className="skel" style={{ height: 18, width: 200 }} />
      <div className="skel" style={{ height: h, marginTop: 16 }} />
    </div>
  );
}

/** 예시 데이터에 없는 조건(SAMPLE_ONLY)이면 기본 조건으로 돌아가는 버튼을 준다. noun은 오류 제목에 쓰는 상품 이름(적금·예금). */
export function ErrorCard({ error, onRetry, onReset, noun = '적금' }: { error: unknown; onRetry: () => void; onReset?: () => void; noun?: string }) {
  const sampleOnly = error instanceof ApiError && error.code === 'SAMPLE_ONLY';
  return (
    <div className="error-box" role="alert">
      <h3>{sampleOnly ? '이 조건은 아직 계산할 수 없어요' : `${noun} 정보를 불러오지 못했어요`}</h3>
      <p className="sub">{errorText(error)}</p>
      <div className="toolbar">
        {sampleOnly && onReset ? (
          <button className="btn btn-primary" onClick={onReset}>
            기본 조건으로
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onRetry}>
            다시 불러오기
          </button>
        )}
      </div>
    </div>
  );
}

/** 조금 내려가면 나타나는 [맨 위로]. 부드럽게 올라간다(움직임 줄이기 설정이면 바로 이동). */
export function ScrollTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  const up = () =>
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  return (
    <button type="button" className="btn btn-primary to-top" onClick={up} aria-label="맨 위로 올라가기">
      ↑ 맨 위로
    </button>
  );
}
