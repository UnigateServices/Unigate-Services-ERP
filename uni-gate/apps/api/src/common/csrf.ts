import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '@unigate/shared';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Reject state-changing requests whose Origin or Referer is not the approved web origin. */
export function csrfGuard(allowedOrigin: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }
    const source = requestOrigin(request);
    if (source !== allowedOrigin) {
      response.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'This request origin is not allowed.',
      });
      return;
    }
    next();
  };
}

function requestOrigin(request: Request): string | null {
  const origin = request.header('origin');
  if (origin) return origin;
  const referer = request.header('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
