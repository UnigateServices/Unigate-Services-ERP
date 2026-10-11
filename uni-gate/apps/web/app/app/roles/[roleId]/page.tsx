'use client';

import { useParams } from 'next/navigation';
import { RoleFormScreen } from '@/components/screens/org-screens';
import { usePreferences } from '@/lib/preferences';
import { useGate } from '@/lib/use-gate';

export default function EditAppRolePage() {
  const session = useGate('app');
  const params = useParams<{ roleId: string }>();
  const { messages } = usePreferences();
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!session.companyId) return <p className="field-hint">{messages.pendingAreas}</p>;
  return <RoleFormScreen companyId={session.companyId} roleId={params.roleId} chrome="app" />;
}
