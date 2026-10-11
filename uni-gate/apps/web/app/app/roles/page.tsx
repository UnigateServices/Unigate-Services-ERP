'use client';

import { RolesScreen } from '@/components/screens/org-screens';
import { usePreferences } from '@/lib/preferences';
import { useGate } from '@/lib/use-gate';

export default function AppRolesPage() {
  const session = useGate('app');
  const { messages } = usePreferences();
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!session.companyId) return <p className="field-hint">{messages.pendingAreas}</p>;
  return <RolesScreen companyId={session.companyId} chrome="app" />;
}
