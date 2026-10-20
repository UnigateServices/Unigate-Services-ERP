import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type ModuleKey } from '@unigate/shared';
import type { Request } from 'express';
import type { RequestAuth } from '../auth/auth.service';
import { ModulesService } from './modules.service';

export const MODULE_ACCESS = 'unigate:module-access';

export type ModuleAccessMetadata = {
  key?: ModuleKey;
};

/** Require CompanyModule.enabled for the session company. Omit key to use the route param `key`. */
export const RequireEnabledModule = (key?: ModuleKey) => SetMetadata(MODULE_ACCESS, { key } satisfies ModuleAccessMetadata);

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: ModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const spec = this.reflector.getAllAndOverride<ModuleAccessMetadata | undefined>(MODULE_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!spec) return true;
    const request = context.switchToHttp().getRequest<Request & { auth?: RequestAuth }>();
    if (!request.auth) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Authentication is required.',
      });
    }
    const param = request.params.key;
    const key = spec.key ?? (typeof param === 'string' ? param : '');
    await this.modules.assertEnabled(request.auth, key);
    return true;
  }
}
