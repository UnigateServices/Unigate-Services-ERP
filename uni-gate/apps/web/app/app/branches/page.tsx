'use client';

import { BranchesScreen } from '@/components/screens/org-screens';
import { usePreferences } from '@/lib/preferences';
import { useGate } from '@/lib/use-gate';

export default function AppBranchesPage() {
  const session = useGate('app');
  const { messages } = usePreferences();
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!session.companyId) return <p className="field-hint">{messages.pendingAreas}</p>;
  return <BranchesScreen companyId={session.companyId} chrome="app" />;
}
