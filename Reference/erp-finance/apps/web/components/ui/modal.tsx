'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { bindDismiss } from '../../lib/dismiss-stack';
import { Button } from './button';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  closeLabel?: string;
  className?: string;
  danger?: boolean;
  front?: boolean;
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

export function ModalFooter({
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
      <Button variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        type={type}
        form={formId}
        variant="primary"
        disabled={submitDisabled || saving}
        onClick={type === 'button' ? onSave : undefined}
      >
        {saving ? savingLabel : saveLabel}
      </Button>
    </>
  );
}

export function useDismiss(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => bindDismiss(() => ref.current()), []);
}

export function Modal({ title, onClose, children, footer, wide, closeLabel = 'إغلاق', className, danger, front }: Props) {
  useDismiss(onClose);

  return (
    <div className={`shell-modal ui-dialog-backdrop${front ? ' is-front' : ''}`} role="presentation" onClick={onClose}>
      <div
        className={`paper-modal ui-dialog${wide ? ' is-wide' : ''}${danger ? ' is-danger' : ''}${className ? ` ${className}` : ''}`}
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
        <div className="notice-body ui-dialog-body">{children}</div>
        {footer ? <div className="ui-dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
