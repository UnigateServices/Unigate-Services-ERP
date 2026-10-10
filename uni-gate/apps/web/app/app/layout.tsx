'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell';
import { usePreferences } from '@/lib/preferences';
import { useGate } from '@/lib/use-gate';

export default function CustomerAppLayout({ children }: { children: ReactNode }) {
  const session = useGate('app');
  const pathname = usePathname();
  const { messages } = usePreferences();
  if (!session) return <p role="status">{messages.checking}</p>;
  const connected = pathname === '/app' || pathname === '/app/branches' || pathname.startsWith('/app/branches/');
  if (session.actor === 'platform' && !connected) {
    const company = session.actingCompany;
    return (
      <AppShell
        session={session}
        items={[
          { href: '/platform', label: messages.navDashboard },
          { href: '/platform/companies', label: messages.navCompanies },
        ]}
      >
        <h1>{company?.name ?? messages.companyContext}</h1>
        <p className="field-hint">{messages.pendingAreas}</p>
      </AppShell>
    );
  }
  return children;
}
