import { isSubscriptionExpired } from '@unigate/shared';

describe('subscription day', () => {
  it('keeps the expiry date itself valid and expires the next calendar day', () => {
    expect(isSubscriptionExpired('2026-10-04', '2026-10-04')).toBe(false);
    expect(isSubscriptionExpired('2026-10-04', '2026-10-05')).toBe(true);
    expect(isSubscriptionExpired('2026-10-04', '2026-10-03')).toBe(false);
  });
});
