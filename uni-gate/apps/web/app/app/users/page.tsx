'use client';

import { UsersScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function AppUsersPage() {
  const session = useGate('app');
  if (!session?.companyId) return null;
  return <UsersScreen companyId={session.companyId} chrome="app" />;
}
