'use client';

import { useState } from 'react';
import { OpsField, OpsInput } from './ops-field';

export function BarcodeScan({
  disabled,
  onScan,
}: {
  disabled?: boolean;
  onScan: (code: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <OpsField label="مسح الباركود" hint="الماسح يكتب الرمز ثم Enter. المسح مرة ثانية يزيد الكمية.">
      <OpsInput
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
    </OpsField>
  );
}
