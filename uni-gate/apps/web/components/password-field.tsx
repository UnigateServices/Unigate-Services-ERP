'use client';

import { useId, useState, type Ref } from 'react';
import { fieldDescribedBy, FormField } from '@/components/form-field';
import { usePreferences } from '@/lib/preferences';

type PasswordFieldProps = {
  id?: string;
  label: string;
  value: string;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
};

export function PasswordField({
  id,
  label,
  value,
  error,
  autoComplete = 'current-password',
  disabled,
  inputRef,
  onChange,
}: PasswordFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const { messages } = usePreferences();
  const [visible, setVisible] = useState(false);

  return (
    <FormField id={fieldId} label={label} error={error}>
      <div className="password-wrap">
        <input
          ref={inputRef}
          id={fieldId}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(fieldId, error)}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? messages.hidePassword : messages.showPassword}
        </button>
      </div>
    </FormField>
  );
}
