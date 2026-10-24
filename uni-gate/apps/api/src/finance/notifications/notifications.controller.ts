import { Delete, Get, Param, Query } from '@nestjs/common';
import type { RequestAuth } from '../../auth/auth.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { financeActor } from '../finance-access';
import { FinanceRoute } from '../finance-route';
import { NotificationsService } from './notifications.service';

/** A member's own notifications. A platform operator in support has none (no membership). */
@FinanceRoute('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('counts')
  counts(@CurrentAuth() auth: RequestAuth) {
    return this.notifications.counts(financeActor(auth));
  }

  @Get()
  list(@CurrentAuth() auth: RequestAuth, @Query('section') section?: string) {
    return this.notifications.list(financeActor(auth), section);
  }

  @Delete(':id')
  remove(@CurrentAuth() auth: RequestAuth, @Param('id') id: string) {
    return this.notifications.remove(financeActor(auth), id);
  }
}
