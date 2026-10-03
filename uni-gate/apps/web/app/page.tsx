'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePreferences } from '@/lib/preferences';
import { readPlatformSession } from '@/lib/session';

export default function HomePage() {
  const router = useRouter();
  const { messages } = usePreferences();

  useEffect(() => {
    router.replace(readPlatformSession() ? '/platform' : '/login/platform');
  }, [router]);

  return <p role="status">{messages.checking}</p>;
}
