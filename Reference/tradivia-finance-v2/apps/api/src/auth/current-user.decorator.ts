import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = {
  id: string;
  name: string;
  role: 'GENERAL_MANAGER' | 'SUPERVISOR' | 'EMPLOYEE' | 'MONITOR';
  companyId: string;
  locationId: string | null;
  locationName: string | null;
  sessionLocked: boolean;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
