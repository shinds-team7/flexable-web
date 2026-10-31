// 비교 화면 필터 부품: 칩 줄(펼침 패널은 칩 줄 바로 아래에 열린다), 기간 막대, 금액 입력, 고른 조건 줄.
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icons';
import { won } from '@/lib/format';

export type ChipDef = { id: string; label: string; count?: number; panel: ReactNode };

/** 칩을 누르면 그 칩의 패널이 아래에 열리고, 같은 칩을 다시 누르면 닫힌다. 한 번에 하나만 열린다. */
export function FilterChips({ chips }: { chips: ChipDef[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const cur = chips.find((c) => c.id === open);
  return (
    <div className="cf">
      <div className="cf-chips">
        {chips.map((c) => (
          <button key={c.id} type="button" className="cf-chip" aria-expanded={open === c.id} aria-controls={`cf-${c.id}`} onClick={() => setOpen(open === c.id ? null : c.id)}>
            {c.label}
            {c.count ? <b className="num">{c.count}</b> : null}
            <i className="cf-caret" aria-hidden="true" />
          </button>
        ))}
      </div>
      {cur && (
        <div className="cf-panel" id={`cf-${cur.id}`}>
          {cur.panel}
        </div>
      )}
    </div>
  );
}

/** 기간 고르기: 점이 찍힌 막대에서 한 칸을 누른다. */
export function TermTrack<T extends number>({ terms, value, onChange }: { terms: T[]; value: T; onChange: (t: T) => void }) {
  const at = terms.indexOf(value);
  return (
    <div className="cf-track" role="radiogroup" aria-label="기간">
      <div className="cf-rail" aria-hidden="true">
        <span style={{ width: `${(at / (terms.length - 1)) * 100}%` }} />
      </div>
      <div className="cf-stops" style={{ gridTemplateColumns: `repeat(${terms.length},1fr)` }}>
        {terms.map((t, i) => (
          <button key={t} type="button" role="radio" aria-checked={t === value} className={i <= at ? 'done' : ''} onClick={() => onChange(t)}>
            <i aria-hidden="true" />
            <span>{t}개월</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 금액 입력: 쉼표를 붙여 보여 주고, [확인]을 눌러야 적용한다. */
export function AmountInput({ value, unit, onApply, label }: { value: number; unit: number; onApply: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : '');
  useEffect(() => setDraft(value > 0 ? String(value) : ''), [value]);
  const n = Math.floor(Number(draft) / unit) * unit;
  const ok = Number.isFinite(n) && n >= unit;
  const small = draft !== '' && !ok;
  const apply = () => ok && onApply(n);
  return (
    <div className="cf-amt">
      <div className={'cf-amt-box' + (small ? ' bad' : '')}>
        <input
          className="cf-amt-input"
          inputMode="numeric"
          placeholder="금액을 입력해주세요"
          aria-label={label}
          value={draft === '' ? '' : won(Number(draft))}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), apply())}
        />
        {draft !== '' && (
          <button type="button" className="cf-amt-clear" aria-label="지우기" onClick={() => setDraft('')}>
            <Icon id="i-close" size={12} />
          </button>
        )}
        <button type="button" className="btn btn-primary cf-amt-ok" disabled={!ok} onClick={apply}>
          확인
        </button>
      </div>
      <p className={'meta' + (small ? ' bad' : '')}>{unit >= 10000 ? `${won(unit / 10000)}만원` : `${won(unit)}원`} 이상부터 가능해요{ok && n !== Number(draft) ? ` · ${won(n)}원으로 맞춰요` : ''}</p>
    </div>
  );
}

/** 고른 조건을 작은 알약으로 보여 주고, 하나씩 지우거나 모두 되돌린다. */
export function SelectedBar({ items, onReset }: { items: { key: string; label: string; onRemove?: () => void }[]; onReset: () => void }) {
  return (
    <div className="cf-sel">
      <div className="cf-sel-list">
        {items.map((it) => (
          <span key={it.key} className="cf-pill">
            {it.label}
            {it.onRemove && (
              <button type="button" aria-label={`${it.label} 조건 지우기`} onClick={it.onRemove}>
                <Icon id="i-close" size={10} />
              </button>
            )}
          </span>
        ))}
      </div>
      <button type="button" className="cf-reset" aria-label="조건 모두 되돌리기" onClick={onReset}>
        <Icon id="i-refresh" size={18} />
      </button>
    </div>
  );
}
