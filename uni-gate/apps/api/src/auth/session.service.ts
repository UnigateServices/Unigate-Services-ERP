import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ACCESS_MAX_AGE_MS } from './cookies';

export type SessionActor = 'platform' | 'member';

export type SessionClaims = {
  userId: string;
  actor: SessionActor;
  authVersion: number;
  actingCompanyId: string | null;
  /** Unix seconds. Present after verification. Omitted when issuing a fresh login. */
  expiresAt?: number;
};

type TokenBody = {
  sub: string;
  actor: SessionActor;
  ver: number;
  exp: number;
  actingCompanyId?: string;
};

@Injectable()
export class SessionService {
  constructor(private readonly config: ConfigService) {}

  sign(claims: SessionClaims, ttlSeconds: number | { expiresAt?: number; ttlSeconds?: number } = ACCESS_MAX_AGE_MS / 1000): string {
    const now = Math.floor(Date.now() / 1000);
    const exp =
      typeof ttlSeconds === 'number'
        ? now + ttlSeconds
        : ttlSeconds.expiresAt ?? now + (ttlSeconds.ttlSeconds ?? ACCESS_MAX_AGE_MS / 1000);
    const body: TokenBody = {
      sub: claims.userId,
      actor: claims.actor,
      ver: claims.authVersion,
      exp,
    };
    if (claims.actingCompanyId) body.actingCompanyId = claims.actingCompanyId;
    const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
    const signature = createHmac('sha256', this.secret()).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  verify(token: string): SessionClaims | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, signature] = parts;
    if (!encoded || !signature) return null;
    const expected = createHmac('sha256', this.secret()).update(encoded).digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      return null;
    }
    let body: TokenBody;
    try {
      body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenBody;
    } catch {
      return null;
    }
    if (body.actor !== 'platform' && body.actor !== 'member') return null;
    if (typeof body.sub !== 'string' || typeof body.ver !== 'number' || typeof body.exp !== 'number') return null;
    if (body.exp <= Math.floor(Date.now() / 1000)) return null;
    return {
      userId: body.sub,
      actor: body.actor,
      authVersion: body.ver,
      actingCompanyId: typeof body.actingCompanyId === 'string' ? body.actingCompanyId : null,
      expiresAt: body.exp,
    };
  }

  private secret(): string {
    const secret = this.config.get<string>('AUTH_SECRET');
    if (!secret) throw new Error('AUTH_SECRET is required');
    return secret;
  }
}
