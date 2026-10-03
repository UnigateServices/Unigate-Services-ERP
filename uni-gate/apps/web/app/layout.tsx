import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PreferencesProvider } from '@/lib/preferences';
import './brand-tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Unigate',
  description: 'Unigate Services',
};

const themeBoot = `(function(){try{var l=localStorage.getItem('ug_lang');var t=localStorage.getItem('ug_theme');var lang=l==='en'?'en':'ar';var theme=t==='dark'?'dark':'light';var d=document.documentElement;d.lang=lang;d.dir=lang==='ar'?'rtl':'ltr';d.dataset.theme=theme;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="light" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
