import { Get } from '@nestjs/common';
import type { RequestAuth } from '../../../auth/auth.service';
import { CurrentAuth } from '../../../auth/current-auth.decorator';
import { financeActor } from '../../finance-access';
import { FinanceRoute } from '../../finance-route';
import { MembersService } from './members.service';

@FinanceRoute('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.members.list(financeActor(auth));
  }
}
