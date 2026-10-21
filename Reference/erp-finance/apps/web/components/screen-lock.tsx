'use client';

import { FormEvent, useState } from 'react';
import { ApiError, unlockSession } from '../lib/api';

type Props = {
  name: string;
  onUnlocked: () => Promise<void> | void;
};

const ERRORS: Record<string, string> = {
  WRONG_CREDENTIALS: 'كلمة المرور غير صحيحة.',
  INACTIVE: 'هذا الحساب غير نشط حالياً.',
  REQUEST_FAILED: 'تعذر الاتصال بالخادم.',
};

export function ScreenLock({ name, onUnlocked }: Props) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [shake, setShake] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await unlockSession(password);
      setPassword('');
      await onUnlocked();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'REQUEST_FAILED';
      setMessage(ERRORS[code || 'REQUEST_FAILED'] || ERRORS.REQUEST_FAILED);
      setShake(false);
      requestAnimationFrame(() => setShake(true));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="lock-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const input = event.currentTarget.querySelector<HTMLInputElement>('#lockPassword');
          input?.focus();
        }
      }}
    >
      <section className={`card lock-card${shake ? ' lock-shake' : ''}`}>
        <div className="lock-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm3 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
          </svg>
        </div>
        <div className="lock-title">الشاشة مقفلة</div>
        <div className="lock-employee-name">{name || '—'}</div>
        <p className="lock-subtitle">تم القفل التلقائي بسبب عدم النشاط — أدخل كلمة المرور للمتابعة</p>
        <form onSubmit={onSubmit} autoComplete="off">
          <div className="form-group">
            <label htmlFor="lockPassword">كلمة المرور</label>
            <div className="input-wrap">
              <input
                id="lockPassword"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="أدخل كلمة المرور"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                autoFocus
              />
              <button type="button" className="input-icon-btn" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? 'إخفاء' : 'عرض'}
              </button>
            </div>
          </div>
          <button type="submit" className="btn auth-submit" disabled={busy || !password}>
            {busy ? 'جاري التحقق...' : 'فتح القفل'}
          </button>
          {message ? <p className="alert">{message}</p> : null}
        </form>
      </section>
    </div>
  );
}
