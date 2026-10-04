export function todayDamascus() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatDate(isoDate: string, lang: 'ar' | 'en') {
  const stamp = new Date(`${isoDate}T12:00:00+03:00`);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SY' : 'en-GB', {
    timeZone: 'Asia/Damascus',
    dateStyle: 'medium',
  }).format(stamp);
}

export function formatDateTime(iso: string, lang: 'ar' | 'en') {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SY' : 'en-GB', {
    timeZone: 'Asia/Damascus',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatUsd(amount: number, lang: 'ar' | 'en') {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SY' : 'en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function isPastDate(isoDate: string) {
  return isoDate < todayDamascus();
}
