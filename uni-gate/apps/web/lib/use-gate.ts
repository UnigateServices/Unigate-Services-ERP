'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { readSession } from '@/lib/session';
import type { AppSession } from '@/types/auth';

export function useGate(kind: 'platform' | 'app') {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);

  useEffect(() => {
    const current = readSession();
    if (!current) {
      router.replace(kind === 'app' ? '/login' : '/login/platform');
      return;
    }
    if (kind === 'platform' && current.actor !== 'platform') {
      router.replace('/app');
      return;
    }
    if (kind === 'app' && !current.companyId) {
      router.replace(current.actor === 'platform' ? '/platform' : '/login');
      return;
    }
    setSession(current);
  }, [kind, router]);

  return session;
}
