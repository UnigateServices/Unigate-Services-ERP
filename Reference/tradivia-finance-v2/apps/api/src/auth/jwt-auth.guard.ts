import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from './current-user.decorator';
import { SCREEN_LOCK_ENABLED } from './screen-lock';

const LOCK_ALLOWED_SUFFIXES = ['/auth/me', '/auth/lock', '/auth/unlock'];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = await super.canActivate(context);
    if (!allowed) return false;

    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      originalUrl?: string;
      path?: string;
    }>();
    if (!SCREEN_LOCK_ENABLED || !request.user?.sessionLocked) return true;

    const path = String(request.originalUrl || request.path || '').split('?')[0];
    if (LOCK_ALLOWED_SUFFIXES.some((suffix) => path.endsWith(suffix))) {
      return true;
    }

    throw new ForbiddenException({
      success: false,
      code: 'SESSION_LOCKED',
      sessionLocked: true,
      message: 'SESSION_LOCKED',
    });
  }
}
