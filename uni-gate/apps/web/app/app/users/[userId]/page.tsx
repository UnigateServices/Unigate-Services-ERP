'use client';

import { useParams } from 'next/navigation';
import { UserFormScreen } from '@/components/screens/org-screens';
import { usePreferences } from '@/lib/preferences';
import { useGate } from '@/lib/use-gate';

export default function EditAppUserPage() {
  const session = useGate('app');
  const params = useParams<{ userId: string }>();
  const { messages } = usePreferences();
  if (!session) return <p role="status">{messages.checking}</p>;
  if (!session.companyId) return <p className="field-hint">{messages.pendingAreas}</p>;
  return <UserFormScreen companyId={session.companyId} userId={params.userId} chrome="app" />;
}
