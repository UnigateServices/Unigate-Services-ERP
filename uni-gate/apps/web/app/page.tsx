'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePreferences } from '@/lib/preferences';
import { readSession } from '@/lib/session';

export default function HomePage() {
  const router = useRouter();
  const { messages } = usePreferences();

  useEffect(() => {
    const session = readSession();
    if (!session) router.replace('/login/platform');
    else if (session.companyId) router.replace('/app');
    else router.replace('/platform');
  }, [router]);

  return <p role="status">{messages.checking}</p>;
}
