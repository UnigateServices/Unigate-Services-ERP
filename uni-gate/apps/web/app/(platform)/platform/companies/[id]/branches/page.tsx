'use client';

import { useParams } from 'next/navigation';
import { BranchesScreen } from '@/components/screens/org-screens';

export default function PlatformBranchesPage() {
  const params = useParams<{ id: string }>();
  return <BranchesScreen companyId={params.id} chrome="platform" />;
}
