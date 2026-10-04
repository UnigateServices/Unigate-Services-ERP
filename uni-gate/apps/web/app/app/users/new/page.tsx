'use client';

import { UserFormScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function NewAppUserPage() {
  const session = useGate('app');
  if (!session?.companyId) return null;
  return <UserFormScreen companyId={session.companyId} chrome="app" />;
}
