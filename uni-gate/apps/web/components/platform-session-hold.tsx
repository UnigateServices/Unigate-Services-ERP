'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { usePreferences } from '@/lib/preferences';
import { clearSession, readPlatformSession } from '@/lib/session';
import type { PlatformSession } from '@/types/auth';

export function PlatformSessionHold() {
  const router = useRouter();
  const { messages } = usePreferences();
  const [session, setSession] = useState<PlatformSession | null>(null);

  useEffect(() => {
    const current = readPlatformSession();
    if (!current) {
      router.replace('/login/platform');
      return;
    }
    setSession(current);
  }, [router]);

  if (!session) {
    return (
      <AuthLayout eyebrow={messages.platformEyebrow} title={messages.operatorSignIn}>
        <p role="status">{messages.checking}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow={messages.platformEyebrow} title={messages.operatorSignIn}>
      <p className="hold-copy">
        {messages.signedInAs} {session.name}
      </p>
      <p className="hold-note">{messages.holdNote}</p>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          clearSession();
          router.replace('/login/platform');
        }}
      >
        {messages.logout}
      </button>
    </AuthLayout>
  );
}
