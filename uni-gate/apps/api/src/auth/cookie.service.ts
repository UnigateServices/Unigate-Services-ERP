import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ACCESS_COOKIE, ACCESS_MAX_AGE_MS, accessCookieOptions, clearAccessCookie } from './cookies';

@Injectable()
export class CookieService {
  constructor(private readonly config: ConfigService) {}

  get secure(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  attach(response: Response, token: string, expiresAt?: number) {
    const maxAge = expiresAt === undefined ? ACCESS_MAX_AGE_MS : Math.max(0, expiresAt * 1000 - Date.now());
    response.cookie(ACCESS_COOKIE, token, { ...accessCookieOptions(this.secure), maxAge });
  }

  clear(response: Response) {
    clearAccessCookie(response, this.secure);
  }
}
