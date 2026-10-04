'use client';

import { RoleFormScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function NewAppRolePage() {
  const session = useGate('app');
  if (!session?.companyId) return null;
  return <RoleFormScreen companyId={session.companyId} chrome="app" />;
}
