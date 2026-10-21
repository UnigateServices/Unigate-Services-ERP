'use client';

import { useState } from 'react';
import { Field, Input } from './ui/field';

export function BarcodeScan({
  disabled,
  quiet,
  onScan,
}: {
  disabled?: boolean;
  quiet?: boolean;
  onScan: (code: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <Field label="مسح الباركود" hint={quiet ? undefined : 'الماسح يكتب الرمز ثم Enter. المسح مرة ثانية يزيد الكمية.'}>
      <Input
        value={value}
        disabled={disabled}
        placeholder="امسح الباركود أو اكتب الرمز"
        autoComplete="off"
        aria-label="مسح الباركود"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const code = value.trim();
          if (!code) return;
          onScan(code);
          setValue('');
        }}
      />
    </Field>
  );
}
