'use client';

import { useParams } from 'next/navigation';
import { RolesScreen } from '@/components/screens/org-screens';

export default function PlatformRolesPage() {
  const params = useParams<{ id: string }>();
  return <RolesScreen companyId={params.id} chrome="platform" />;
}
