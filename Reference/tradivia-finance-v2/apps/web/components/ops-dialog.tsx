'use client';

import { ReactNode, useEffect } from 'react';
import { OpsButton } from './ops-button';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  closeLabel?: string;
  className?: string;
  danger?: boolean;
};

type FooterProps = {
  onCancel: () => void;
  cancelLabel?: string;
  saveLabel?: string;
  savingLabel?: string;
  saving?: boolean;
  submitDisabled?: boolean;
  formId?: string;
  onSave?: () => void;
  primaryType?: 'submit' | 'button';
};

export function OpsDialogFooter({
  onCancel,
  cancelLabel = 'إلغاء',
  saveLabel = 'حفظ التعديلات',
  savingLabel = 'جاري الحفظ...',
  saving,
  submitDisabled,
  formId,
  onSave,
  primaryType,
}: FooterProps) {
  const type = primaryType ?? (formId ? 'submit' : 'button');

  return (
    <>
      <OpsButton variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </OpsButton>
      <OpsButton
        type={type}
        form={formId}
        variant="primary"
        disabled={submitDisabled || saving}
        onClick={type === 'button' ? onSave : undefined}
      >
        {saving ? savingLabel : saveLabel}
      </OpsButton>
    </>
  );
}

export function OpsDialog({ title, onClose, children, footer, wide, closeLabel = 'إغلاق', className, danger }: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="shell-modal ops-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`paper-modal ops-dialog${wide ? ' is-wide' : ''}${danger ? ' is-danger' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="paper-head">
          <div className="paper-title">
            <span>{title}</span>
          </div>
          <button type="button" className="paper-x" onClick={onClose} aria-label={closeLabel}>
            ×
          </button>
        </div>
        <div className="notice-body ops-dialog-body">{children}</div>
        {footer ? <div className="ops-dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
