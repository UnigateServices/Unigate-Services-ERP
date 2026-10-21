'use client';

import { useEffect, useState } from 'react';
import { Lang, readLang } from './i18n';

export function useLang() {
  const [lang, setLang] = useState<Lang>(() => (typeof window === 'undefined' ? 'ar' : readLang()));

  useEffect(() => {
    setLang(readLang());
    function sync() {
      setLang(readLang());
    }
    window.addEventListener('tf-lang', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('tf-lang', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return lang;
}
