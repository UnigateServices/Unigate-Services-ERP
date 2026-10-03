'use client';

import { usePreferences } from '@/lib/preferences';

export function LanguageSwitcher() {
  const { lang, setLang, messages } = usePreferences();
  return (
    <div className="segment" role="group" aria-label={messages.languageLabel}>
      <button type="button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>
        {messages.arabic}
      </button>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        {messages.english}
      </button>
    </div>
  );
}

export function ThemeModeSwitcher() {
  const { theme, setTheme, messages } = usePreferences();
  return (
    <div className="segment" role="group" aria-label={messages.themeLabel}>
      <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
        {messages.dayMode}
      </button>
      <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
        {messages.nightMode}
      </button>
    </div>
  );
}
