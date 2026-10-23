export const ErrorCode = {
  WRONG_CREDENTIALS: 'WRONG_CREDENTIALS',
  INACTIVE: 'INACTIVE',
  LOCKED: 'LOCKED',
  COMPANY_SUSPENDED: 'COMPANY_SUSPENDED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  CODE_TAKEN: 'CODE_TAKEN',
  KEY_TAKEN: 'KEY_TAKEN',
  NAME_TAKEN: 'NAME_TAKEN',
  LOCATION_REQUIRED: 'LOCATION_REQUIRED',
  /** A member tried to change the role they hold (decision L). */
  OWN_ROLE: 'OWN_ROLE',
  /** The change would leave the company without an active user who can edit roles. */
  LAST_ROLE_EDITOR: 'LAST_ROLE_EDITOR',
  DATE_PAST: 'DATE_PAST',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
