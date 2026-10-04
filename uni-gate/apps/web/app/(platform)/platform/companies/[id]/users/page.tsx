'use client';

import { useParams } from 'next/navigation';
import { UsersScreen } from '@/components/screens/org-screens';

export default function PlatformUsersPage() {
  const params = useParams<{ id: string }>();
  return <UsersScreen companyId={params.id} chrome="platform" />;
}
