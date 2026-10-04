export const BUSINESS_TIME_ZONE = 'Asia/Damascus';

/** Calendar day YYYY-MM-DD in Asia/Damascus. */
export function todayInDamascus(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * expiresOn is the last valid calendar day.
 * 2026-10-04 stays valid for all of that day and expires on 2026-10-05.
 */
export function isSubscriptionExpired(expiresOn: string, today: string): boolean {
  return today > expiresOn;
}
