import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestAuth } from './auth.service';

export const CurrentAuth = createParamDecorator((_: unknown, context: ExecutionContext): RequestAuth => {
  return context.switchToHttp().getRequest<{ auth: RequestAuth }>().auth;
});
