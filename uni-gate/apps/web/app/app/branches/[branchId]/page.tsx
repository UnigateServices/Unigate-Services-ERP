'use client';

import { useParams } from 'next/navigation';
import { BranchFormScreen } from '@/components/screens/org-screens';
import { usePreferences } from '@/lib/preferences';
import { useGate } from '@/lib/use-gate';

export default function EditAppBranchPage() {
  const session = useGate('app');
  const params = useParams<{ branchId: string }>();
  const { messages } = usePreferences();
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!session.companyId) return <p className="field-hint">{messages.pendingAreas}</p>;
  return <BranchFormScreen companyId={session.companyId} branchId={params.branchId} chrome="app" />;
}
