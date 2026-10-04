import type { Ref } from 'react';

type InlineAlertProps = {
  message: string;
  tone?: 'danger' | 'info' | 'success';
  alertRef?: Ref<HTMLDivElement>;
};

export function InlineAlert({ message, tone = 'danger', alertRef }: InlineAlertProps) {
  return (
    <div ref={alertRef} className={`inline-alert tone-${tone}`} role="alert" tabIndex={-1}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 5.5v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="14.2" r="0.8" fill="currentColor" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
