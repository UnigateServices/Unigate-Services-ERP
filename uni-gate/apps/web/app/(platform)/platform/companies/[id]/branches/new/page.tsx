'use client';

import { useParams } from 'next/navigation';
import { BranchFormScreen } from '@/components/screens/org-screens';

export default function NewPlatformBranchPage() {
  const params = useParams<{ id: string }>();
  return <BranchFormScreen companyId={params.id} chrome="platform" />;
}
