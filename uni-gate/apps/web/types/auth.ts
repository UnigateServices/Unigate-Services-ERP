export type Lang = 'ar' | 'en';

export type Theme = 'light' | 'dark';

export type Actor = 'platform' | 'member';

export type PlatformSession = {
  actor: 'platform';
  userId: string;
  name: string;
  companyId: null;
  expiresAt: number;
};

export type PlatformOperatorFixture = {
  id: string;
  name: string;
  password: string;
  status: 'ACTIVE' | 'INACTIVE';
};

export type LoginFailureCode = 'WRONG_CREDENTIALS' | 'INACTIVE' | 'LOCKED';

export type PlatformLoginResult =
  | { ok: true; operator: { id: string; name: string } }
  | { ok: false; code: LoginFailureCode };
