'use client';

import { useParams } from 'next/navigation';
import { RoleFormScreen } from '@/components/screens/org-screens';

export default function EditPlatformRolePage() {
  const params = useParams<{ id: string; roleId: string }>();
  return <RoleFormScreen companyId={params.id} roleId={params.roleId} chrome="platform" />;
}
