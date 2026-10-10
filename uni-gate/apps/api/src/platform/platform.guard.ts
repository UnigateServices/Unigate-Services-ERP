import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '@unigate/shared';
import type { RequestAuth } from '../auth/auth.service';

@Injectable()
export class PlatformGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const auth = context.switchToHttp().getRequest<{ auth?: RequestAuth }>().auth;
    if (!auth) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication is required.',
      });
    }
    if (auth.actor !== 'platform') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Platform administration is required.',
      });
    }
    return true;
  }
}
