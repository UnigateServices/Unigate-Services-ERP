'use client';

import { useParams } from 'next/navigation';
import { RoleFormScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function EditAppRolePage() {
  const session = useGate('app');
  const params = useParams<{ roleId: string }>();
  if (!session?.companyId) return null;
  return <RoleFormScreen companyId={session.companyId} roleId={params.roleId} chrome="app" />;
}
