'use client';

import './brand-logo.css';

type BrandLogoProps = {
  className?: string;
  alt?: string;
  /** auto follows data-theme. Pin beige or green on a surface that does not follow the theme. */
  variant?: 'auto' | 'beige' | 'green';
};

export function BrandLogo({ className, alt = 'UNI GATE', variant = 'auto' }: BrandLogoProps) {
  return (
    <span className={['brand-logo', className].filter(Boolean).join(' ')} data-variant={variant}>
      <img className="brand-logo-green" src="/brand/logo-green-no-bg.png" alt={alt} />
      <img className="brand-logo-beige" src="/brand/logo-beige-no-bg.png" alt="" aria-hidden="true" />
    </span>
  );
}
