'use client';

import { useParams } from 'next/navigation';
import { RoleFormScreen } from '@/components/screens/org-screens';

export default function NewPlatformRolePage() {
  const params = useParams<{ id: string }>();
  return <RoleFormScreen companyId={params.id} chrome="platform" />;
}
