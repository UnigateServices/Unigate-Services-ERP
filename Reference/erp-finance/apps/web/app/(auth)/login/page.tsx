'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '../../../components/brand-logo';
import { ApiError, homePath, login } from '../../../lib/api';
import { Lang, applyLang, dictionary, readLang } from '../../../lib/i18n';

const LAST_USER_KEY = 'tf_last_user';

export default function LoginPage() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState<Lang>('ar');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const copy = dictionary(lang).login;
  const errors: Record<string, string> = {
    INACTIVE: copy.inactive,
    WRONG_CREDENTIALS: copy.wrongCredentials,
    REQUEST_FAILED: copy.requestFailed,
  };

  useEffect(() => {
    const storedTheme = (localStorage.getItem('fx_theme') as 'dark' | 'light' | null) || 'light';
    const storedLang = readLang();
    setTheme(storedTheme);
    setLang(storedLang);
    document.documentElement.setAttribute('data-theme', storedTheme);
    applyLang(storedLang);
    setUsername(localStorage.getItem(LAST_USER_KEY) || '');
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('fx_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function chooseLang(next: Lang) {
    setLang(next);
    applyLang(next);
    setMessage('');
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || loading) return;
    setMessage('');
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      localStorage.setItem(LAST_USER_KEY, username.trim());
      router.push(homePath(result.user.role));
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'REQUEST_FAILED';
      setMessage(errors[code || 'REQUEST_FAILED'] || errors.REQUEST_FAILED);
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand" aria-label="UNI GATE">
        <div className="auth-brand-watermark" aria-hidden="true" />
        <div className="auth-brand-glow" aria-hidden="true" />
        <div className="auth-brand-content">
          <BrandLogo variant="beige" className="auth-brand-logo" />
          <p className="auth-kicker">{copy.welcomeKicker}</p>
          <p className="auth-welcome">{copy.welcomeLine}</p>
          <p className="auth-company">{copy.company}</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-tools">
          <div className="auth-lang" role="group" aria-label={copy.language}>
            <button type="button" aria-pressed={lang === 'ar'} onClick={() => chooseLang('ar')}>
              عربي
            </button>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => chooseLang('en')}>
              English
            </button>
          </div>
          <button
            type="button"
            className="auth-tool auth-tool-icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? copy.dayMode : copy.nightMode}
            aria-label={theme === 'dark' ? copy.dayMode : copy.nightMode}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
              </svg>
            )}
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit} autoComplete="on">
          <h1>{copy.title}</h1>
          <div className="form-group">
            <label htmlFor="username">{copy.username}</label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              placeholder={copy.usernamePlaceholder}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              aria-invalid={Boolean(message)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">{copy.password}</label>
            <div className="input-wrap">
              <input
                ref={passwordRef}
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder={copy.passwordPlaceholder}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                aria-invalid={Boolean(message)}
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? copy.hidePassword : copy.showPassword}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27 4.28 6.55l.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3z"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 6c-4.42 0-8.27 2.94-9.83 7 1.56 4.06 5.41 7 9.83 7s8.27-2.94 9.83-7C20.27 8.94 16.42 6 12 6zm0 12c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {message ? (
            <p className="auth-alert" role="alert">
              {message}
            </p>
          ) : null}

          <button type="submit" className="auth-submit" disabled={loading || !username.trim()}>
            {loading ? copy.submitting : copy.submit}
          </button>
        </form>

        <p className="auth-footer">
          Powered by UNI GATE — {copy.rights} © {new Date().getFullYear()}
        </p>
      </section>
    </main>
  );
}
