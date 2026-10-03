'use client';

import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { isLang, isTheme, LANG_KEY, messages, THEME_KEY, type Messages } from '@/lib/messages';
import type { Lang, Theme } from '@/types/auth';

type PreferencesValue = {
  lang: Lang;
  theme: Theme;
  messages: Messages;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

function applyDocument(lang: Lang, theme: Theme) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  root.dataset.theme = theme;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');
  const [theme, setThemeState] = useState<Theme>('light');

  useLayoutEffect(() => {
    const storedLang = window.localStorage.getItem(LANG_KEY);
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const nextLang = isLang(storedLang) ? storedLang : 'ar';
    const nextTheme = isTheme(storedTheme) ? storedTheme : 'light';
    setLangState(nextLang);
    setThemeState(nextTheme);
    applyDocument(nextLang, nextTheme);
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(LANG_KEY, next);
    applyDocument(next, theme);
  };

  const setTheme = (next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_KEY, next);
    applyDocument(lang, next);
  };

  const value = useMemo<PreferencesValue>(
    () => ({
      lang,
      theme,
      messages: messages[lang],
      setLang,
      setTheme,
    }),
    [lang, theme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return value;
}
