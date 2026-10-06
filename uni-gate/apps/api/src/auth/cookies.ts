import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'ug_access';
export const ACCESS_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function accessCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_MAX_AGE_MS,
  };
}

export function readAccessCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const piece of header.split(';')) {
    const index = piece.indexOf('=');
    if (index === -1) continue;
    if (piece.slice(0, index).trim() !== ACCESS_COOKIE) continue;
    return decodeURIComponent(piece.slice(index + 1).trim());
  }
  return undefined;
}

export function attachAccessCookie(response: Response, token: string, secure: boolean) {
  response.cookie(ACCESS_COOKIE, token, accessCookieOptions(secure));
}

export function clearAccessCookie(response: Response, secure: boolean) {
  const options = accessCookieOptions(secure);
  response.clearCookie(ACCESS_COOKIE, {
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
    path: options.path,
  });
}
