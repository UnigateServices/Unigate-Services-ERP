'use client';

import { useParams } from 'next/navigation';
import { UserFormScreen } from '@/components/screens/org-screens';

export default function NewPlatformUserPage() {
  const params = useParams<{ id: string }>();
  return <UserFormScreen companyId={params.id} chrome="platform" />;
}
