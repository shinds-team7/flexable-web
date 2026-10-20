// 확인 창: 되돌릴 수 없는 동작(지우기·되돌리기) 전에 한 번 더 묻는다. 모양은 global.css의 dialog·.dlg가 맡는다.
import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = '취소', danger, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} aria-labelledby="confirmTitle" onCancel={(e) => (e.preventDefault(), onCancel())}>
      <div className="dlg">
        <h2 id="confirmTitle">{title}</h2>
        {children}
        <div className="acts">
          <button type="button" className="btn btn-line" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button type="button" className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
