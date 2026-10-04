'use client';

import { BranchesScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function AppBranchesPage() {
  const session = useGate('app');
  if (!session?.companyId) return null;
  return <BranchesScreen companyId={session.companyId} chrome="app" />;
}
