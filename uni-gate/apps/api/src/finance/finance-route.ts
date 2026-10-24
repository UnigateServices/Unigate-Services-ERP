import { applyDecorators, Controller, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ModuleAccessGuard, RequireEnabledModule } from '../modules/module-access.guard';

/**
 * A finance controller: `/api/finance/<path>`, signed in, and the finance module enabled for the
 * session company on every request. The level check runs in each handler through financeActor.
 */
export function FinanceRoute(path: string) {
  return applyDecorators(
    Controller(`finance/${path}`),
    UseGuards(AuthGuard, ModuleAccessGuard),
    RequireEnabledModule('finance'),
  );
}
