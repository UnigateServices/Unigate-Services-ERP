'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, LoginUser, getLoginUsers, homePath, login } from '../../../lib/api';
import { Lang, applyLang, dictionary, readLang } from '../../../lib/i18n';

const LAST_USER_KEY = 'tf_last_user';

const LOGIN_GROUPS: { label: 'management' | 'supervisors' | 'employees'; roles: LoginUser['role'][] }[] = [
  { label: 'management', roles: ['GENERAL_MANAGER', 'MONITOR'] },
  { label: 'supervisors', roles: ['SUPERVISOR'] },
  { label: 'employees', roles: ['EMPLOYEE'] },
];

export default function LoginPage() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState<Lang>('ar');
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingNames, setLoadingNames] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const copy = dictionary(lang).login;
  const errors: Record<string, string> = {
    INACTIVE: copy.inactive,
    WRONG_CREDENTIALS: copy.wrongCredentials,
    REQUEST_FAILED: copy.requestFailed,
  };
  const groupLabel = {
    management: copy.management,
    supervisors: copy.supervisors,
    employees: copy.employees,
  };
  const roleName: Record<LoginUser['role'], string> = {
    GENERAL_MANAGER: copy.generalManager,
    MONITOR: copy.monitor,
    SUPERVISOR: copy.supervisor,
    EMPLOYEE: copy.employee,
  };

  useEffect(() => {
    const storedTheme = (localStorage.getItem('fx_theme') as 'dark' | 'light' | null) || 'light';
    const storedLang = readLang();
    setTheme(storedTheme);
    setLang(storedLang);
    document.documentElement.setAttribute('data-theme', storedTheme);
    applyLang(storedLang);

    const last = localStorage.getItem(LAST_USER_KEY) || '';
    let cancelled = false;

    async function loadUsers(attempt = 0) {
      if (!cancelled) {
        setLoadingNames(true);
        setLoadError(false);
      }
      try {
        const list = await getLoginUsers();
        if (cancelled) return;
        if (!Array.isArray(list)) throw new Error('LOGIN_USERS');
        setUsers(list);
        if (list.some((row) => row.name === last)) setUsername(last);
        else if (list.length === 1) setUsername(list[0].name);
      } catch {
        if (cancelled) return;
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 700));
          return loadUsers(attempt + 1);
        }
        setUsers([]);
        setLoadError(true);
      } finally {
        if (!cancelled) setLoadingNames(false);
      }
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = users.find((row) => row.name === username) || null;
  const filtered = useMemo(() => {
    const text = query.trim();
    if (!text) return users;
    return users.filter((row) => `${row.name} ${row.locationName || ''}`.includes(text));
  }, [query, users]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('fx_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function toggleLang() {
    const next: Lang = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    applyLang(next);
    setMessage('');
  }

  function pickUser(name: string) {
    setUsername(name);
    setMessage('');
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!username || loading) return;
    setMessage('');
    setLoading(true);
    try {
      const result = await login(username, password);
      localStorage.setItem(LAST_USER_KEY, username);
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
      <div className="auth-shell">
        <section className="auth-panel">
          <div className="auth-head">
            <h1>{copy.title}</h1>
            <div className="auth-tools">
              <button type="button" className="auth-tool" onClick={toggleLang}>
                {copy.language}
              </button>
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
          </div>

          {users.length > 8 ? (
            <div className="form-group auth-search">
              <label htmlFor="userQuery">{copy.search}</label>
              <input
                id="userQuery"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
              />
            </div>
          ) : null}

          <div className="auth-groups" role="listbox" aria-label={copy.accounts}>
            {loadingNames ? <p className="auth-loading">{copy.loading}</p> : null}
            {!loadingNames && loadError ? (
              <p className="auth-empty">
                {copy.requestFailed}{' '}
                <button type="button" className="auth-retry" onClick={() => window.location.reload()}>
                  {copy.retry}
                </button>
              </p>
            ) : null}
            {!loadingNames && !loadError && filtered.length === 0 ? (
              <p className="auth-empty">{query ? copy.noMatch : copy.empty}</p>
            ) : null}
            {LOGIN_GROUPS.map((group) => {
              const rows = filtered.filter((row) => group.roles.includes(row.role));
              if (!rows.length) return null;
              return (
                <div key={group.label}>
                  <p className="auth-group-label">{groupLabel[group.label]}</p>
                  <div className="auth-accounts">
                    {rows.map((row) => (
                      <button
                        key={row.name}
                        type="button"
                        className={`auth-account${username === row.name ? ' is-selected' : ''}`}
                        role="option"
                        aria-selected={username === row.name}
                        onClick={() => pickUser(row.name)}
                      >
                        <span>
                          <strong>{row.name}</strong>
                          <small>
                            {roleName[row.role]}
                            {row.locationName ? ` · ${row.locationName}` : ''}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={onSubmit} autoComplete="off">
            <div className="form-group">
              <label htmlFor="password">{copy.password}</label>
              {!loadingNames && !loadError && users.length > 0 && !username ? <p className="auth-hint">{copy.pickFirst}</p> : null}
              <div className="input-wrap">
                <input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder={copy.passwordPlaceholder}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  aria-invalid={Boolean(message)}
                  disabled={!username}
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

            <button type="submit" className="btn auth-submit" disabled={loading || !username}>
              {loading ? copy.submitting : copy.submit}
            </button>
          </form>

          <p className="auth-footer">
            Powered by UNI GATE — {copy.rights} © {new Date().getFullYear()}
          </p>
        </section>

        <aside className="auth-aside">
          <img className="auth-logo" src="/brand/logo-beige.png" alt="UNI GATE" />
          <h2>UNI GATE</h2>
          <p className="auth-client">{copy.client}</p>
          <p className="auth-tagline">{copy.productLine}</p>
        </aside>
      </div>
    </main>
  );
}
