'use client';

import { useParams } from 'next/navigation';
import { UserFormScreen } from '@/components/screens/org-screens';

export default function EditPlatformUserPage() {
  const params = useParams<{ id: string; userId: string }>();
  return <UserFormScreen companyId={params.id} userId={params.userId} chrome="platform" />;
}
