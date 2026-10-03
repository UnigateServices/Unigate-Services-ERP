import type { Lang, Theme } from '@/types/auth';

export const LANG_KEY = 'ug_lang';
export const THEME_KEY = 'ug_theme';

export type Messages = {
  brand: string;
  platformEyebrow: string;
  operatorSignIn: string;
  username: string;
  password: string;
  showPassword: string;
  hidePassword: string;
  submit: string;
  submitting: string;
  required: string;
  wrongCredentials: string;
  inactive: string;
  locked: string;
  network: string;
  checking: string;
  languageLabel: string;
  arabic: string;
  english: string;
  themeLabel: string;
  dayMode: string;
  nightMode: string;
  signedInAs: string;
  holdNote: string;
  logout: string;
};

export const messages: Record<Lang, Messages> = {
  ar: {
    brand: 'Unigate',
    platformEyebrow: 'إدارة المنصة',
    operatorSignIn: 'دخول المشغّلين',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    showPassword: 'إظهار',
    hidePassword: 'إخفاء',
    submit: 'دخول',
    submitting: 'جاري الدخول',
    required: 'مطلوب',
    wrongCredentials: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
    inactive: 'هذا الحساب موقوف. راجع إدارة Unigate.',
    locked: 'الحساب مقفل مؤقتاً. حاول بعد ربع ساعة.',
    network: 'تعذر الاتصال بالخادم.',
    checking: 'جاري التحقق من الجلسة',
    languageLabel: 'اللغة',
    arabic: 'العربية',
    english: 'English',
    themeLabel: 'المظهر',
    dayMode: 'نهاري',
    nightMode: 'ليلي',
    signedInAs: 'تم الدخول باسم',
    holdNote: 'لوحة المنصة تُبنى في الخطوة التالية.',
    logout: 'خروج',
  },
  en: {
    brand: 'Unigate',
    platformEyebrow: 'Platform administration',
    operatorSignIn: 'Operator sign in',
    username: 'Username',
    password: 'Password',
    showPassword: 'Show',
    hidePassword: 'Hide',
    submit: 'Sign in',
    submitting: 'Signing in',
    required: 'Required',
    wrongCredentials: 'Username or password is incorrect.',
    inactive: 'This account is inactive. Contact a Unigate administrator.',
    locked: 'This account is temporarily locked. Try again in 15 minutes.',
    network: 'Could not reach the server.',
    checking: 'Checking session',
    languageLabel: 'Language',
    arabic: 'العربية',
    english: 'English',
    themeLabel: 'Appearance',
    dayMode: 'Day',
    nightMode: 'Night',
    signedInAs: 'Signed in as',
    holdNote: 'The platform dashboard is built in the next step.',
    logout: 'Sign out',
  },
};

export function isLang(value: string | null): value is Lang {
  return value === 'ar' || value === 'en';
}

export function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}
