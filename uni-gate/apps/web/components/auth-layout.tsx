import type { ReactNode } from 'react';
import { LanguageSwitcher, ThemeModeSwitcher } from '@/components/preference-switchers';

type AuthLayoutProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
};

export function AuthLayout({ eyebrow, title, children }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <div className="auth-tools">
        <LanguageSwitcher />
        <ThemeModeSwitcher />
      </div>
      <section className="auth-card">
        <div className="brand-mark">
          <strong>Unigate</strong>
          <span>{eyebrow}</span>
        </div>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
