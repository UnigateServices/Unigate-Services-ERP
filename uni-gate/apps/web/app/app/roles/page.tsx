'use client';

import { RolesScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function AppRolesPage() {
  const session = useGate('app');
  if (!session?.companyId) return null;
  return <RolesScreen companyId={session.companyId} chrome="app" />;
}
