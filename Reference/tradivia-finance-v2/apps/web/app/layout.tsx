import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';
import './auth.css';
import '../components/warehouse.css';
import '../components/sales.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'UNI GATE',
  description: 'UNI GATE — TRADIVIA',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.className} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(!localStorage.getItem('fx_canvas')){localStorage.setItem('fx_theme','light');localStorage.setItem('fx_canvas','white');}var t=localStorage.getItem('fx_theme')||'light';var l=localStorage.getItem('fx_lang')==='en'?'en':'ar';document.documentElement.setAttribute('data-theme',t);document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr';}catch(e){}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
