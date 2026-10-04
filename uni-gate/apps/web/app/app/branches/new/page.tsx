'use client';

import { BranchFormScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function NewAppBranchPage() {
  const session = useGate('app');
  if (!session?.companyId) return null;
  return <BranchFormScreen companyId={session.companyId} chrome="app" />;
}
