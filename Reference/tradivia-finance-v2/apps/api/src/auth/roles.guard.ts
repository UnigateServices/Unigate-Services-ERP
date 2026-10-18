import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser } from './current-user.decorator';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) return false;
    if (roles.includes(user.role as Role)) return true;
    return user.role === 'MONITOR' && this.monitorMayRead(request, roles);
  }

  private monitorMayRead(request: Request, roles: Role[]) {
    if (!roles.includes(Role.GENERAL_MANAGER)) return false;
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD') return true;
    const path = request.originalUrl || request.url || '';
    return method === 'POST' && path.includes('/reports/run');
  }
}
