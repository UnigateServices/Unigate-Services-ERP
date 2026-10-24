/**
 * Finance records point at a Membership (decision A). The display name lives on its User.
 * These selects and `withNames` keep the original response shape: `{ id, name }` or `{ name }`.
 */
export const personRef = { select: { id: true, user: { select: { name: true } } } } as const;
export const personName = { select: { user: { select: { name: true } } } } as const;

type Person = { user: { name: string } } & Record<string, unknown>;
type Flat<P> = P extends { user: { name: string } } ? Omit<P, 'user'> & { name: string } : P;
export type WithNames<T> = { [K in keyof T]: T[K] extends Person | null ? Flat<NonNullable<T[K]>> | Extract<T[K], null> : T[K] };

function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== 'object') return false;
  const user = (value as { user?: unknown }).user;
  return Boolean(user && typeof user === 'object' && typeof (user as { name?: unknown }).name === 'string');
}

function flatten(value: Person) {
  const { user, ...rest } = value;
  return { ...rest, name: user.name };
}

/** Replaces each person relation (`employee`, `requester`, ...) with `{ ...fields, name }`. */
export function withNames<T extends Record<string, unknown>>(row: T): WithNames<T> {
  const out: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(row)) {
    if (isPerson(value)) out[key] = flatten(value);
  }
  return out as WithNames<T>;
}
