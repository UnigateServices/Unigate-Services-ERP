'use client';

import { useParams } from 'next/navigation';
import { BranchFormScreen } from '@/components/screens/org-screens';

export default function EditPlatformBranchPage() {
  const params = useParams<{ id: string; branchId: string }>();
  return <BranchFormScreen companyId={params.id} branchId={params.branchId} chrome="platform" />;
}
