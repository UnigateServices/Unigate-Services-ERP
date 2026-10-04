'use client';

import { useParams } from 'next/navigation';
import { UserFormScreen } from '@/components/screens/org-screens';
import { useGate } from '@/lib/use-gate';

export default function EditAppUserPage() {
  const session = useGate('app');
  const params = useParams<{ userId: string }>();
  if (!session?.companyId) return null;
  return <UserFormScreen companyId={session.companyId} userId={params.userId} chrome="app" />;
}
