'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AuthUser, FundsSnapshot, changePassword, lockSession, logout, onSessionLocked } from '../lib/api';
import { Lang, applyLang, dictionary, readLang } from '../lib/i18n';
import { masterErrorMessage } from '../lib/master-errors';
import { FundsBar } from './funds-bar';
import { ScreenLock } from './screen-lock';

export type WorkspaceItem = {
  id: string;
  label: string;
  comingSoon?: boolean;
};

export type WorkspaceGroup = {
  title: string;
  icon?: string;
  items: WorkspaceItem[];
};

const IDLE_LIMIT_MS = 20 * 60 * 1000;
/** Off while the product is still being built and tried. Turn back on before client delivery. */
const SCREEN_LOCK_ENABLED = false;

type Props = {
  actor: AuthUser;
  subtitle: string;
  groups: WorkspaceGroup[];
  defaultSection: string;
  sections: Record<string, ReactNode>;
  funds?: FundsSnapshot | null;
  unreadCount?: number;
  initiallyLocked?: boolean;
  onUnlocked?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  onLogout?: () => Promise<void>;
  moduleId?: string;
  onHome?: () => void;
};

function readHash(fallback: string, moduleId?: string) {
  if (typeof window === 'undefined') return fallback;
  const raw = window.location.hash.replace('#', '');
  if (!raw || raw === 'home' || raw === 'notifications') return fallback;
  if (moduleId) {
    const prefix = `${moduleId}/`;
    if (raw.startsWith(prefix)) return raw.slice(prefix.length) || fallback;
    if (!raw.includes('/')) return raw;
    return fallback;
  }
  const section = raw.split('/')[0];
  return section || fallback;
}

export function WorkspaceShell({
  actor,
  groups,
  defaultSection,
  sections,
  funds = null,
  unreadCount = 0,
  initiallyLocked = false,
  onUnlocked,
  onRefresh,
  onLogout,
  moduleId,
  onHome,
}: Props) {
  const availableKey = groups
    .flatMap((group) =>
      group.items.filter((item) => !item.comingSoon && item.id !== 'notifications').map((item) => item.id),
    )
    .join(',');
  const available = useMemo(() => availableKey.split(',').filter(Boolean), [availableKey]);
  const [section, setSection] = useState(defaultSection);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [lang, setLang] = useState<Lang>('ar');
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [syncedAt, setSyncedAt] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [locked, setLocked] = useState(SCREEN_LOCK_ENABLED && initiallyLocked);
  const [notesOpen, setNotesOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [pop, setPop] = useState('');
  const lockedRef = useRef(SCREEN_LOCK_ENABLED && initiallyLocked);
  const lastActivityAt = useRef(Date.now());
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lockedRef.current = locked;
    document.body.classList.toggle('app-locked', locked);
    return () => document.body.classList.remove('app-locked');
  }, [locked]);

  async function applyLock() {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    try {
      await lockSession();
    } catch {
      /* overlay stays even if the server call fails */
    }
  }

  useEffect(() => {
    if (!SCREEN_LOCK_ENABLED) return;
    onSessionLocked(() => {
      lockedRef.current = true;
      setLocked(true);
    });
    return () => onSessionLocked(null);
  }, []);

  useEffect(() => {
    if (!SCREEN_LOCK_ENABLED) return;
    if (locked) {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      return;
    }

    function resetIdle() {
      if (lockedRef.current) return;
      lastActivityAt.current = Date.now();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => void applyLock(), IDLE_LIMIT_MS);
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;
    events.forEach((event) => document.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    return () => {
      events.forEach((event) => document.removeEventListener(event, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [locked]);

  useEffect(() => {
    if (!SCREEN_LOCK_ENABLED) return;
    function maybeLock() {
      if (document.hidden || lockedRef.current) return;
      if (Date.now() - lastActivityAt.current >= IDLE_LIMIT_MS) void applyLock();
    }
    document.addEventListener('visibilitychange', maybeLock);
    window.addEventListener('focus', maybeLock);
    return () => {
      document.removeEventListener('visibilitychange', maybeLock);
      window.removeEventListener('focus', maybeLock);
    };
  }, []);

  useEffect(() => {
    const stored = (localStorage.getItem('fx_theme') as 'dark' | 'light' | null) || 'light';
    const storedLang = readLang();
    setTheme(stored);
    setLang(storedLang);
    setCollapsed(localStorage.getItem('tf_side') === '1');
    document.documentElement.setAttribute('data-theme', stored);
    applyLang(storedLang);

    const hash = readHash(defaultSection, moduleId);
    if (hash === 'notifications') setNotesOpen(true);
    setSection(available.includes(hash) ? hash : defaultSection);

    function onHash() {
      const id = readHash(defaultSection, moduleId);
      if (id === 'notifications') {
        setNotesOpen(true);
        return;
      }
      if (available.includes(id)) setSection(id);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [available, defaultSection, moduleId]);

  function openSection(id: string) {
    setSection(id);
    setNavOpen(false);
    if (typeof window !== 'undefined') {
      const hash = moduleId ? `#${moduleId}/${id}` : `#${id}`;
      window.history.replaceState(null, '', hash);
    }
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('fx_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    pulse('theme');
  }

  function pulse(name: string) {
    setPop(name);
    window.setTimeout(() => setPop((current) => (current === name ? '' : current)), 280);
  }

  useEffect(() => {
    function onFull() {
      setFullScreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);

  useEffect(() => {
    if (!notesOpen && !passwordOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setNotesOpen(false);
      setPasswordOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notesOpen, passwordOpen]);

  function toggleSide() {
    if (window.innerWidth <= 860) {
      setNavOpen((open) => !open);
      return;
    }
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem('tf_side', next ? '1' : '0');
      return next;
    });
  }

  function toggleGroup(title: string) {
    setOpenGroups((current) => ({ ...current, [title]: current[title] === false }));
  }

  async function handleRefresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
      setSyncedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }

  function toggleLang() {
    const next: Lang = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    applyLang(next);
    pulse('lang');
  }

  async function toggleFullScreen() {
    pulse('full');
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  }

  async function handleLogout() {
    await logout();
    if (onLogout) await onLogout();
  }

  function openPassword() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordMessage('');
    setPasswordOpen(true);
  }

  async function handlePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    if (newPassword !== confirmPassword) {
      setPasswordError(dictionary(lang).shell.passwordMismatch);
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMessage(dictionary(lang).shell.passwordSaved);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordError(masterErrorMessage(error));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleUnlocked() {
    lockedRef.current = false;
    lastActivityAt.current = Date.now();
    setLocked(false);
    if (onUnlocked) await onUnlocked();
  }

  const currentLabel =
    groups.flatMap((group) => group.items).find((item) => item.id === section)?.label || '';
  const copy = dictionary(lang);
  const navGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== 'notifications'),
    }))
    .filter((group) => group.items.length > 0);
  const navItems = navGroups.flatMap((group) => group.items.filter((item) => !item.comingSoon));
  const updated = syncedAt.toLocaleTimeString('en-GB', { hour12: false });

  return (
    <>
      <div
        className={`workspace${navOpen ? ' nav-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
        aria-hidden={locked || undefined}
      >
        {navOpen ? (
          <button type="button" className="workspace-backdrop" aria-label={copy.shell.menu} onClick={() => setNavOpen(false)} />
        ) : null}

        <aside className="workspace-side">
          <div className="side-brand">
            <img src="/brand/logo-beige.png" alt="" />
            <div className="side-brand-text">
              <span>Powered by</span>
              <strong>UNI GATE</strong>
            </div>
          </div>
          {collapsed ? (
            <nav className="side-rail">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={section === item.id ? 'active' : ''}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => openSection(item.id)}
                >
                  <Glyph d={iconPath(item.id)} />
                </button>
              ))}
            </nav>
          ) : (
            <nav className="side-nav">
              {navGroups.map((group) => {
                const open = openGroups[group.title] !== false;
                const parentActive = group.items.some((item) => item.id === section);
                return (
                  <div key={group.title} className="side-group">
                    <button
                      type="button"
                      className={`side-toggle${open ? ' open' : ''}${parentActive ? ' parent-active' : ''}`}
                      onClick={() => toggleGroup(group.title)}
                    >
                      <Glyph d={iconPath(group.icon || 'ops')} />
                      <span>{group.title}</span>
                      <i />
                    </button>
                    <div className={`side-sub${open ? ' open' : ''}`} aria-hidden={open ? undefined : true}>
                      <div>
                        {group.items.map((item) =>
                          item.comingSoon ? (
                            <span key={item.id} className="side-link soon">
                              {item.label}
                            </span>
                          ) : (
                            <button
                              key={item.id}
                              type="button"
                              className={`side-link${section === item.id ? ' active' : ''}`}
                              onClick={() => openSection(item.id)}
                            >
                              <b />
                              <span>{item.label}</span>
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </nav>
          )}
          <div className="side-status" title={copy.shell.session}>
            <div className="side-status-label">{copy.shell.systemStatus}</div>
            <div className="side-status-row">
              <i>
                <b />
              </i>
              <span>{copy.shell.connected}</span>
            </div>
          </div>
        </aside>

        <div className="workspace-col">
          <header className="workspace-top">
            <div className="top-start">
              <button type="button" className="icon-btn" onClick={toggleSide} title={copy.shell.menu} aria-label={copy.shell.menu}>
                <Glyph d={PATHS.menu} />
              </button>
              <div className="top-title">
                <i />
                <h1>{currentLabel}</h1>
              </div>
            </div>
            <div className="top-actions">
              <div className="last-update" title={`${copy.shell.lastUpdate} ${updated}`}>
                <span>{copy.shell.lastUpdate}</span>
                <strong>{updated}</strong>
              </div>
              <button type="button" className={`icon-btn${pop === 'lang' ? ' is-pop' : ''}`} onClick={toggleLang} title={copy.shell.changeLanguage} aria-label={copy.shell.changeLanguage}>
                <em>{lang === 'ar' ? 'EN' : 'ع'}</em>
              </button>
              <button
                type="button"
                className={`icon-btn${pop === 'theme' ? ' is-pop' : ''}`}
                onClick={toggleTheme}
                title={copy.shell.changeTheme}
                aria-label={copy.shell.changeTheme}
              >
                <Glyph d={theme === 'dark' ? PATHS.sun : PATHS.moon} />
              </button>
              {onRefresh ? (
                <button
                  type="button"
                  className={`icon-btn${refreshing ? ' is-spin' : ''}`}
                  onClick={() => void handleRefresh()}
                  title={copy.shell.refresh}
                  aria-label={copy.shell.refresh}
                >
                <Glyph d={PATHS.refresh} />
              </button>
            ) : null}
            <button
              type="button"
              className={`icon-btn${pop === 'full' ? ' is-pop' : ''}`}
              onClick={() => void toggleFullScreen()}
              title={copy.shell.fullscreen}
              aria-label={copy.shell.fullscreen}
            >
              <Glyph d={fullScreen ? PATHS.fullscreenExit : PATHS.fullscreen} />
            </button>
            <button
                type="button"
                className="icon-btn"
                onClick={() => setNotesOpen(true)}
                title={copy.shell.notifications}
                aria-label={copy.shell.notifications}
              >
                <Glyph d={PATHS.notifications} />
                {unreadCount > 0 ? <span className="icon-badge">{unreadCount}</span> : null}
              </button>
              <span className="top-split" />
              <div className="user-pill">
                <Glyph d={PATHS.people} />
                <span>{actor.name}</span>
              </div>
              <button type="button" className="icon-btn" onClick={openPassword} title={copy.shell.changePassword} aria-label={copy.shell.changePassword}>
                <Glyph d={PATHS.key} />
              </button>
              <button type="button" className="icon-btn is-danger" onClick={() => void handleLogout()} title={copy.shell.logout} aria-label={copy.shell.logout}>
                <Glyph d={PATHS.logout} />
              </button>
              {onHome ? (
                <button type="button" className="icon-btn top-back" onClick={onHome} title={copy.shell.back} aria-label={copy.shell.back}>
                  <Glyph d={PATHS.back} />
                </button>
              ) : null}
            </div>
          </header>

          <main className="workspace-main">
            {section === 'income' || section === 'outcome' || section === 'exchange' || section === 'transfer' || section === 'advances' || section === 'opening' || section === 'reports' || section === 'locations' || section === 'people' || section === 'borrowers' || section === 'projects' || section === 'banks' || section === 'warehouse' || section === 'nrv' || section === 'ledger' || section === 'statements' || section.startsWith('log-') ? null : <FundsBar funds={funds} section={section} />}
            {locked ? null : (
              <div key={section} className="section-stage">
                {sections[section] || null}
              </div>
            )}
          </main>
        </div>
      </div>
      {notesOpen ? (
        <div className="shell-modal" role="presentation" onClick={() => setNotesOpen(false)}>
          <div
            className="paper-modal notice-card"
            role="dialog"
            aria-modal="true"
            aria-label={copy.shell.notifications}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="paper-head">
              <div className="paper-title">
                <Glyph d={PATHS.notifications} />
                <span>{copy.shell.notifications}</span>
              </div>
              <button type="button" className="paper-x" onClick={() => setNotesOpen(false)} aria-label={copy.shell.close}>
                ×
              </button>
            </div>
            <div className="notice-body">
              {sections.notifications}
              <button type="button" className="notice-close" onClick={() => setNotesOpen(false)}>
                {copy.shell.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {passwordOpen ? (
        <div className="shell-modal" role="presentation" onClick={() => setPasswordOpen(false)}>
          <div
            className="paper-modal pw-card"
            role="dialog"
            aria-modal="true"
            aria-label={copy.shell.changePassword}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="paper-head">
              <div className="paper-title">
                <span>{copy.shell.changePassword}</span>
              </div>
              <button type="button" className="paper-x" onClick={() => setPasswordOpen(false)} aria-label={copy.shell.close}>
                ×
              </button>
            </div>
            <div className="notice-body">
              <form id="pw-change-form" className="pw-form" onSubmit={(event) => void handlePassword(event)}>
                <label>
                  {copy.shell.currentPassword}
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                  />
                </label>
                <label>
                  {copy.shell.newPassword}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    minLength={4}
                    required
                  />
                </label>
                <label>
                  {copy.shell.confirmPassword}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={4}
                    required
                  />
                </label>
                {passwordError ? <p className="pw-error">{passwordError}</p> : null}
                {passwordMessage ? <p className="pw-ok">{passwordMessage}</p> : null}
              </form>
            </div>
            <div className="ops-dialog-foot">
              <button type="button" className="ops-dialog-btn is-secondary" onClick={() => setPasswordOpen(false)}>
                {copy.shell.close}
              </button>
              <button type="submit" form="pw-change-form" className="ops-dialog-btn is-primary" disabled={passwordSaving}>
                {passwordSaving ? copy.shell.savingPassword : copy.shell.savePassword}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {SCREEN_LOCK_ENABLED && locked ? <ScreenLock name={actor.name} onUnlocked={handleUnlocked} /> : null}
    </>
  );
}

const PATHS: Record<string, string> = {
  menu: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
  apps: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  sun: 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z',
  moon: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z',
  refresh: 'M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  fullscreenExit: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
  notifications: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  key: 'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  people: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  borrowers: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  ops: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  follow: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  admin: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
  monitor: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  approvals: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  'audit-log': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  reports: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z',
  income: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
  outcome: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  exchange: 'M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z',
  transfer: 'M9 3L5 6.99h3V14h2V6.99h3L9 3zm7 14.01V10h-2v7.01h-3L15 21l4-3.99h-3z',
  advances: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  opening: 'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  locations: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  projects: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  banks: 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  ledger: 'M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4z',
  records: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z',
  stock: 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z',
  sales: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.5L19.5 10H14V4.5zM8 13h8v2H8v-2zm0 4h8v2H8v-2z',
  purchases: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.5L19.5 10H14V4.5zM8 13h8v2H8v-2zm0 4h5v2H8v-2z',
  warehouse: 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z',
};

function iconPath(id: string) {
  if (id.startsWith('log-')) return PATHS[id.slice(4)] || PATHS.records;
  return PATHS[id] || PATHS.ops;
}

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
