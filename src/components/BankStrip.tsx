// 금융권·대표 은행을 가로로 보여 주는 줄과, 맨 끝 [상세 필터]에서 여는 전체 은행 선택창.
// 금융권(은행·저축은행)과 은행 이름은 여러 개를 함께 고를 수 있다. 은행 이름을 고르면 그 은행만 보인다.
import { useEffect, useRef, useState } from 'react';
import { BankBadge, shortBankName } from '@/components/BankBadge';
import { Icon } from '@/components/Icons';
import type { Sector } from '@/data/savings';

export type BankOption = { name: string; sector: Sector };

// 대표 은행: 화면 이름 · 공시 회사 이름에 들어 있는 낱말(은행 권역에서만 찾는다)
const REP_BROKER = [
  { label: '미래에셋', key: '미래에셋' },
  { label: '삼성', key: '삼성' },
  { label: 'NH투자', key: 'NH투자' },
  { label: '한국투자', key: '한국투자' },
  { label: 'KB', key: 'KB' },
];
const REP = [
  { label: 'KB국민', key: '국민' },
  { label: '신한', key: '신한' },
  { label: '하나', key: '하나' },
  { label: '우리', key: '우리' },
  { label: 'NH농협', key: '농협' },
];
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function initial(name: string) {
  const code = name.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? CHO[Math.floor(code / 588)] : '';
}
const INDEX = [
  { label: 'A-Z', test: (c: string) => /^[A-Za-z0-9]/.test(c) },
  { label: 'ㄱ-ㄷ', test: (c: string) => 'ㄱㄲㄴㄷㄸ'.includes(initial(c)) },
  { label: 'ㄹ-ㅂ', test: (c: string) => 'ㄹㅁㅂㅃ'.includes(initial(c)) },
  { label: 'ㅅ-ㅈ', test: (c: string) => 'ㅅㅆㅇㅈㅉ'.includes(initial(c)) },
  { label: 'ㅊ-ㅌ', test: (c: string) => 'ㅊㅋㅌ'.includes(initial(c)) },
  { label: 'ㅍ-ㅎ', test: (c: string) => 'ㅍㅎ'.includes(initial(c)) },
];

function BankCard({ name, label, on, disabled, onClick }: { name: string; label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="bank-card" aria-pressed={on} disabled={disabled} onClick={onClick}>
      <BankBadge name={name} size={32} />
      <span className="bank-card-name">{label}</span>
      <i className="bank-card-mark" aria-hidden="true">
        {on ? '✓' : '+'}
      </i>
    </button>
  );
}

function BankDialog({
  open,
  companies,
  value,
  broker,
  onApply,
  onClose,
}: {
  open: boolean;
  companies: BankOption[];
  value: string[];
  broker: boolean;
  onApply: (v: string[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Sector>('BANK');
  const [draft, setDraft] = useState<string[]>(value);
  const [idx, setIdx] = useState<number | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDraft(value);
      setIdx(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const inTab = broker ? companies : companies.filter((c) => c.sector === tab);
  const list = tab === 'SAVINGS_BANK' && idx !== null ? inTab.filter((c) => INDEX[idx].test(shortBankName(c.name))) : inTab;
  const allOn = inTab.length > 0 && inTab.every((c) => draft.includes(c.name));
  const toggle = (n: string) => setDraft((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]));
  const toggleAll = () => setDraft((d) => (allOn ? d.filter((n) => !inTab.some((c) => c.name === n)) : [...new Set([...d, ...inTab.map((c) => c.name)])]));
  const word = broker ? '증권사' : tab === 'BANK' ? '은행' : '저축은행';
  return (
    <dialog ref={ref} className="bank-dlg" aria-labelledby="bankDlgTitle" onCancel={(e) => (e.preventDefault(), onClose())}>
      <div className="bank-dlg-head">
        <h2 id="bankDlgTitle">{broker ? '증권사 선택' : '은행 선택'}</h2>
        <button type="button" className="bank-dlg-x" aria-label="닫기" onClick={onClose}>
          <Icon id="i-close" size={20} />
        </button>
      </div>
      {!broker && (
      <div className="bank-dlg-tabs" role="tablist" aria-label="금융권">
        {(['BANK', 'SAVINGS_BANK'] as Sector[]).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)}>
            {s === 'BANK' ? '은행' : '저축은행'}
          </button>
        ))}
      </div>
      )}
      <div className="bank-dlg-body">
        <div className="bank-dlg-sub">
          <span>{word}</span>
          <label className="bank-dlg-all">
            <input type="checkbox" checked={allOn} onChange={toggleAll} />
            모든 {word} 선택
          </label>
        </div>
        {!broker && tab === 'SAVINGS_BANK' && (
          <div className="bank-index" role="group" aria-label="가나다순 찾기">
            {INDEX.map((o, i) => (
              <button key={o.label} type="button" aria-pressed={idx === i} onClick={() => setIdx(idx === i ? null : i)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        <div className="bank-grid">
          {list.map((c) => (
            <BankCard key={c.name} name={c.name} label={shortBankName(c.name)} on={draft.includes(c.name)} onClick={() => toggle(c.name)} />
          ))}
          {list.length === 0 && <p className="sub">조건에 맞는 {word}이 없어요.</p>}
        </div>
      </div>
      <div className="bank-dlg-foot">
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => onApply(draft)}>
          확인
        </button>
      </div>
    </dialog>
  );
}

export function BankStrip({
  companies,
  sectors,
  onSectors,
  picked,
  onPicked,
  variant = 'bank',
}: {
  companies: BankOption[];
  sectors: Sector[];
  onSectors: (v: Sector[]) => void;
  picked: string[];
  onPicked: (v: string[]) => void;
  variant?: 'bank' | 'broker'; // broker: 증권사(CMA). 금융권 카드 없이 대표 증권사와 전체 선택창만 둔다
}) {
  const broker = variant === 'broker';
  const [open, setOpen] = useState(false);
  const toggleSector = (s: Sector) => onSectors(sectors.includes(s) ? sectors.filter((x) => x !== s) : [...sectors, s]);
  const toggleBank = (n: string) => onPicked(picked.includes(n) ? picked.filter((x) => x !== n) : [...picked, n]);
  return (
    <div className="bank-strip">
      <div className="bank-row" role="group" aria-label="금융권과 대표 은행">
        {!broker && (
          <>
        <button type="button" className="bank-card sector" aria-pressed={sectors.includes('BANK')} onClick={() => toggleSector('BANK')}>
          <span className="bank-card-ico" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11l10-6 10 6zM6 12v8M11 12v8M17 12v8M22 12v8M4 23h20" />
            </svg>
          </span>
          <span className="bank-card-name">1금융권</span>
        </button>
        <button type="button" className="bank-card sector" aria-pressed={sectors.includes('SAVINGS_BANK')} onClick={() => toggleSector('SAVINGS_BANK')}>
          <span className="bank-card-ico" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 24V5h11v19M17 11h5v13M3 24h22M10 9h3M10 13h3M10 17h3" />
            </svg>
          </span>
          <span className="bank-card-name">저축은행</span>
        </button>
          </>
        )}
        {(broker ? REP_BROKER : REP).map((r) => {
          const hit = companies.find((c) => (broker || c.sector === 'BANK') && c.name.includes(r.key));
          return <BankCard key={r.label} name={hit?.name ?? r.label} label={r.label} on={!!hit && picked.includes(hit.name)} disabled={!hit} onClick={() => hit && toggleBank(hit.name)} />;
        })}
        <button type="button" className="bank-more" aria-label="상세 필터: 전체 은행에서 고르기" onClick={() => setOpen(true)}>
          <Icon id="i-sliders" size={18} />
        </button>
      </div>
      <BankDialog
        open={open}
        companies={companies}
        value={picked}
        broker={broker}
        onApply={(v) => {
          onPicked(v);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
