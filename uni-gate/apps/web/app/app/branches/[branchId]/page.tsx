'use client';

import { useParams } from 'next/navigation';
import { BranchFormScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function EditAppBranchPage() {
  const session = useGate('app');
  const params = useParams<{ branchId: string }>();
  if (!session?.companyId) return null;
  return <BranchFormScreen companyId={session.companyId} branchId={params.branchId} chrome="app" />;
}
