// 적금·예금 비교 화면이 같이 쓰는 부품: 고지 문구, 불러오는 중, 오류 카드, 은행 선택창, 맨 위로 버튼.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icons';
import { ApiError, errorText } from '@/lib/api';

export type CompanyOption = { name: string; sector: 'BANK' | 'SAVINGS_BANK' };

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

/** 은행·저축은행을 한 번에 여러 개 고르는 선택창. 아무것도 안 고르면 '전체'. */
export function CompanyPicker({ companies, value, onChange }: { companies: CompanyOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((x) => x !== name) : [...value, name]);
  const label = value.length === 0 ? '전체' : value.length === 1 ? value[0] : `${value[0]} 외 ${value.length - 1}`;
  const group = (title: string, sector: CompanyOption['sector']) => {
    const list = companies.filter((c) => c.sector === sector);
    return (
      list.length > 0 && (
        <div className="sv-pick-group">
          <h4>{title}</h4>
          {list.map((c) => (
            <label key={c.name} className="check">
              <input type="checkbox" checked={value.includes(c.name)} onChange={() => toggle(c.name)} />
              {c.name}
            </label>
          ))}
        </div>
      )
    );
  };
  return (
    <details className="sv-pick" ref={ref}>
      <summary className="input" aria-label="은행 고르기">
        <span className="sv-pick-label">{label}</span>
      </summary>
      <div className="sv-pick-panel">
        <label className="check sv-pick-all">
          <input type="checkbox" checked={value.length === 0} onChange={() => onChange([])} />
          전체
        </label>
        {group('은행', 'BANK')}
        {group('저축은행', 'SAVINGS_BANK')}
      </div>
    </details>
  );
}
