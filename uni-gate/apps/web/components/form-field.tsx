'use client';

import type { ReactNode } from 'react';
import { usePreferences } from '@/lib/preferences';

type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: ReactNode;
};

export function FormField({ id, label, error, required, optional, hint, children }: FormFieldProps) {
  const { messages } = usePreferences();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span className="req"> ({messages.required})</span> : null}
        {optional ? <span className="opt"> ({messages.optional})</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function fieldDescribedBy(id: string, error?: string, hint?: string) {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}
