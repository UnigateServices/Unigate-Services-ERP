'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AuthUser, logout } from '../lib/api';
import { Lang, applyLang, dictionary, readLang } from '../lib/i18n';
import type { ModuleCard, ModuleId } from '../lib/modules';
import { PALETTE_OPEN_EVENT } from '../lib/palette-open';
import { BrandLogo } from './brand-logo';
import './module-home.css';

const ICONS: Record<string, string> = {
  dashboard: 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z',
  wallet: 'M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9zm-9-2h10V8H12v8zm4-2.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
  search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  ops: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  sales: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.5L19.5 10H14V4.5zM8 13h8v2H8v-2zm0 4h8v2H8v-2z',
  purchases: 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
  stock: 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z',
  ledger: 'M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4z',
  crm: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  follow: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  admin: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
  sun: 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z',
  moon: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z',
  notifications: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
};

const TONE: Record<string, string> = {
  dashboard: '#13362F',
  wallet: '#4A7C59',
  sales: '#1B6B4A',
  purchases: '#8C6239',
  stock: '#3E6F78',
  ledger: '#13362F',
  crm: '#245C4A',
  ops: '#4A7C59',
  follow: '#5C6B73',
  admin: '#6B5E4E',
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name] || ICONS.ops} />
    </svg>
  );
}

type Props = {
  actor: AuthUser;
  modules: ModuleCard[];
  unreadCount?: number;
  notifications?: ReactNode;
  onOpen: (id: ModuleId) => void;
  onLogout?: () => Promise<void>;
};

export function ModuleHome({ actor, modules, unreadCount = 0, notifications, onOpen, onLogout }: Props) {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [lang, setLang] = useState<Lang>('ar');
  const [notesOpen, setNotesOpen] = useState(false);
  const [query, setQuery] = useState('');
  const copy = dictionary(lang);
  const visible = modules.filter((module) => {
    const text = query.trim();
    if (!text) return true;
    return `${module.title} ${module.description}`.includes(text);
  });

  useEffect(() => {
    const stored = (localStorage.getItem('fx_theme') as 'dark' | 'light' | null) || 'light';
    const storedLang = readLang();
    setTheme(stored);
    setLang(storedLang);
    document.documentElement.setAttribute('data-theme', stored);
    applyLang(storedLang);
  }, []);

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
  }

  async function handleLogout() {
    await logout();
    if (onLogout) await onLogout();
  }

  return (
    <div className="module-home">
      <header className="module-bar">
        <div className="module-brand">
          <BrandLogo />
          <strong>UNI GATE</strong>
        </div>
        <div className="module-bar-actions">
          <span className="module-user">{actor.name}</span>
          <button
            type="button"
            className="module-icon"
            title={`${copy.shell.search} · Ctrl+K`}
            aria-label={copy.shell.search}
            onClick={() => window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT))}
          >
            <Icon name="search" />
          </button>
          <button type="button" className="module-quiet" onClick={toggleLang} title={copy.shell.changeLanguage} aria-label={copy.shell.changeLanguage}>
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <button type="button" className="module-icon" onClick={toggleTheme} title={copy.shell.changeTheme} aria-label={copy.shell.changeTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button type="button" className="module-icon" onClick={() => setNotesOpen(true)} title={copy.shell.notifications} aria-label={copy.shell.notifications}>
            <Icon name="notifications" />
            {unreadCount > 0 ? <span className="module-count">{unreadCount}</span> : null}
          </button>
          <button type="button" className="module-quiet" onClick={() => void handleLogout()}>
            {copy.shell.logout}
          </button>
        </div>
      </header>
      <main className="module-home-body">
        <header className="launcher-head">
          <h1>{copy.shell.workspace}</h1>
          <p>{copy.shell.pickModule}</p>
          <label className="launcher-search">
            <span>{copy.shell.searchApps}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.shell.searchApps}
              type="search"
            />
          </label>
        </header>
        {visible.length === 0 ? <p className="launcher-empty">{copy.shell.noApps}</p> : null}
        <div className="module-grid">
          {visible.map((module) => (
            <button key={module.id} type="button" className="module-app" onClick={() => onOpen(module.id)}>
              <i style={{ color: TONE[module.icon] || '#13362F' }}>
                <Icon name={module.icon} />
              </i>
              <span>
                <strong>{module.title}</strong>
                <small>{module.description}</small>
              </span>
            </button>
          ))}
        </div>
      </main>
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
                <span>{copy.shell.notifications}</span>
              </div>
              <button type="button" className="paper-x" onClick={() => setNotesOpen(false)} aria-label={copy.shell.close}>
                ×
              </button>
            </div>
            <div className="notice-body">
              {notifications}
              <button type="button" className="notice-close" onClick={() => setNotesOpen(false)}>
                {copy.shell.close}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
