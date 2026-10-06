'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { fieldDescribedBy, FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { PasswordField } from '@/components/password-field';
import { PrimaryButton } from '@/components/primary-button';
import { usePreferences } from '@/lib/preferences';
import { loadSession } from '@/lib/session';
import { loginPlatform } from '@/services/platform-auth';
import type { LoginFailureCode } from '@/types/auth';

export function PlatformLoginForm() {
  const router = useRouter();
  const { messages } = usePreferences();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameMissing, setUsernameMissing] = useState(false);
  const [passwordMissing, setPasswordMissing] = useState(false);
  const [formCode, setFormCode] = useState<LoginFailureCode | 'network' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const alertRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((current) => {
      if (cancelled) return;
      if (current?.actor === 'platform') {
        router.replace(current.companyId ? '/app' : '/platform');
        return;
      }
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const usernameError = usernameMissing ? messages.required : '';
  const passwordError = passwordMissing ? messages.required : '';
  const formError =
    formCode === 'network'
      ? messages.network
      : formCode === 'INACTIVE'
        ? messages.inactive
        : formCode === 'LOCKED'
          ? messages.locked
          : formCode === 'WRONG_CREDENTIALS'
            ? messages.wrongCredentials
            : '';

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextUsernameMissing = !username.trim();
    const nextPasswordMissing = !password;
    setUsernameMissing(nextUsernameMissing);
    setPasswordMissing(nextPasswordMissing);
    setFormCode('');
    if (nextUsernameMissing) {
      usernameRef.current?.focus();
      return;
    }
    if (nextPasswordMissing) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await loginPlatform(username, password);
      if (!result.ok) {
        setFormCode(result.code);
        if (result.code === 'WRONG_CREDENTIALS') setPassword('');
        return;
      }
      router.push('/platform');
    } catch {
      setFormCode('network');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow={messages.platformEyebrow} title={messages.operatorSignIn}>
      {checking ? (
        <p role="status">{messages.checking}</p>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <FormField id="username" label={messages.username} error={usernameError}>
            <input
              ref={usernameRef}
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              disabled={submitting}
              aria-invalid={usernameError ? true : undefined}
              aria-describedby={fieldDescribedBy('username', usernameError)}
              onChange={(event) => setUsername(event.target.value)}
            />
          </FormField>
          <PasswordField
            id="password"
            label={messages.password}
            value={password}
            error={passwordError}
            disabled={submitting}
            inputRef={passwordRef}
            onChange={setPassword}
          />
          {formError ? <InlineAlert alertRef={alertRef} message={formError} /> : null}
          <PrimaryButton disabled={submitting}>
            {submitting ? messages.submitting : messages.submit}
          </PrimaryButton>
        </form>
      )}
    </AuthLayout>
  );
}
