import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '@unigate/shared';
import type { Request, Response } from 'express';
import { clearAccessCookie, readAccessCookie } from './cookies';
import { RequestAuth, AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly cookies: CookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { auth?: RequestAuth }>();
    const response = http.getResponse<Response>();
    const token = readAccessCookie(request.header('cookie'));
    const claims = token ? this.sessions.verify(token) : null;
    const auth = claims ? await this.auth.resolve(claims) : null;
    if (!auth) {
      clearAccessCookie(response, this.cookies.secure);
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication is required.',
      });
    }
    request.auth = auth;
    return true;
  }
}
