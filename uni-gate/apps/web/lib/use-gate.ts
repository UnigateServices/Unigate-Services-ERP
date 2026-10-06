'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadSession } from '@/lib/session';
import type { AppSession } from '@/types/auth';

export function useGate(kind: 'platform' | 'app') {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((current) => {
      if (cancelled) return;
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
    });
    return () => {
      cancelled = true;
    };
  }, [kind, router]);

  return session;
}
