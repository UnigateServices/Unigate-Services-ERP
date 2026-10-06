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
import { loginCustomer } from '@/services/customer-auth';
import type { LoginFailureCode } from '@/types/auth';

export function CustomerLoginForm() {
  const router = useRouter();
  const { messages } = usePreferences();
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [codeMissing, setCodeMissing] = useState(false);
  const [usernameMissing, setUsernameMissing] = useState(false);
  const [passwordMissing, setPasswordMissing] = useState(false);
  const [formCode, setFormCode] = useState<LoginFailureCode | 'network' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((session) => {
      if (cancelled) return;
      if (session?.actor === 'member') {
        router.replace('/app');
        return;
      }
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const codeError = codeMissing ? messages.required : '';
  const usernameError = usernameMissing ? messages.required : '';
  const passwordError = passwordMissing ? messages.required : '';
  const formError =
    formCode === 'network'
      ? messages.network
      : formCode === 'INACTIVE'
        ? messages.inactive
        : formCode === 'LOCKED'
          ? messages.locked
          : formCode === 'COMPANY_SUSPENDED'
            ? messages.companySuspended
            : formCode === 'SUBSCRIPTION_EXPIRED'
              ? messages.subscriptionExpired
              : formCode === 'WRONG_CREDENTIALS'
                ? messages.wrongCredentials
                : '';

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missingCode = !code.trim();
    const missingName = !username.trim();
    const missingPassword = !password;
    setCodeMissing(missingCode);
    setUsernameMissing(missingName);
    setPasswordMissing(missingPassword);
    setFormCode('');
    if (missingCode || missingName || missingPassword) return;
    setSubmitting(true);
    try {
      const result = await loginCustomer(code, username, password);
      if (!result.ok) {
        setFormCode(result.code);
        if (result.code === 'WRONG_CREDENTIALS') setPassword('');
        return;
      }
      router.push('/app');
    } catch {
      setFormCode('network');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow={messages.companyContext} title={messages.companySignIn}>
      {checking ? (
        <p role="status">{messages.checking}</p>
      ) : (
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <FormField id="company-code" label={messages.companyCode} required hint={messages.companyCodeHint} error={codeError}>
            <input
              id="company-code"
              value={code}
              autoComplete="organization"
              disabled={submitting}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={fieldDescribedBy('company-code', codeError, messages.companyCodeHint)}
              onChange={(event) => setCode(event.target.value.toLowerCase())}
            />
          </FormField>
          <FormField id="username" label={messages.username} required error={usernameError}>
            <input
              id="username"
              value={username}
              autoComplete="username"
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
            onChange={setPassword}
          />
          {formError ? <InlineAlert alertRef={alertRef} message={formError} /> : null}
          <PrimaryButton disabled={submitting}>{submitting ? messages.submitting : messages.submit}</PrimaryButton>
        </form>
      )}
    </AuthLayout>
  );
}
