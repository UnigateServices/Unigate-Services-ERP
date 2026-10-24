import { Get } from '@nestjs/common';
import type { RequestAuth } from '../../auth/auth.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { financeActor } from '../finance-access';
import { FinanceRoute } from '../finance-route';
import { BalancesService } from './balances.service';

@FinanceRoute('balances')
export class BalancesController {
  constructor(private readonly balances: BalancesService) {}

  @Get()
  getFunds(@CurrentAuth() auth: RequestAuth) {
    return this.balances.getFunds(financeActor(auth));
  }
}
