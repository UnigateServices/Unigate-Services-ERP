'use client';

import { CURRENCIES, CurrencyCode } from '../lib/api';
import { dictionary } from '../lib/i18n';
import { useLang } from '../lib/use-lang';
import { Select } from './ui/select';

function Flag({ code }: { code: 'us' | 'sy' }) {
  if (code === 'sy') {
    return (
      <svg className="ccy-flag" viewBox="0 0 18 12" aria-hidden="true">
        <rect width="18" height="4" fill="#007A3D" />
        <rect y="4" width="18" height="4" fill="#FFFFFF" />
        <rect y="8" width="18" height="4" fill="#000000" />
        <circle cx="7" cy="6" r="1.1" fill="#CE1126" />
        <circle cx="11" cy="6" r="1.1" fill="#CE1126" />
      </svg>
    );
  }
  return (
    <svg className="ccy-flag" viewBox="0 0 18 12" aria-hidden="true">
      <rect width="18" height="12" fill="#B22234" />
      <rect y="1" width="18" height="1" fill="#FFFFFF" />
      <rect y="3" width="18" height="1" fill="#FFFFFF" />
      <rect y="5" width="18" height="1" fill="#FFFFFF" />
      <rect y="7" width="18" height="1" fill="#FFFFFF" />
      <rect y="9" width="18" height="1" fill="#FFFFFF" />
      <rect y="11" width="18" height="1" fill="#FFFFFF" />
      <rect width="8" height="6.5" fill="#3C3B6E" />
    </svg>
  );
}

export function currencyName(code: string, lang: 'ar' | 'en') {
  const copy = dictionary(lang).income;
  if (code === 'SYP') return copy.syp;
  return copy.usd;
}

export function CurrencyMark({ code }: { code: string }) {
  const lang = useLang();
  const item = CURRENCIES.find((row) => row.value === code) || CURRENCIES[0];
  return (
    <span className="ccy-sel">
      <span className="ccy-name">{currencyName(code, lang)}</span>
      <span className="ccy-code" dir="ltr">{item.code}</span>
      <Flag code={item.flag} />
    </span>
  );
}

export function CurrencySelect({
  value,
  onChange,
}: {
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(next) => onChange(next as CurrencyCode)}
      options={CURRENCIES.map((item) => ({
        value: item.value,
        label: <CurrencyMark code={item.value} />,
      }))}
    />
  );
}
