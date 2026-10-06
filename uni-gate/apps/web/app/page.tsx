'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePreferences } from '@/lib/preferences';
import { loadSession } from '@/lib/session';

export default function HomePage() {
  const router = useRouter();
  const { messages } = usePreferences();

  useEffect(() => {
    let cancelled = false;
    loadSession().then((session) => {
      if (cancelled) return;
      if (!session) router.replace('/login/platform');
      else if (session.companyId) router.replace('/app');
      else router.replace('/platform');
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <p role="status">{messages.checking}</p>;
}
