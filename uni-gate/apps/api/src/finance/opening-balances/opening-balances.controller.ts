import { Body, Delete, Get, Param, Post, Query } from '@nestjs/common';
import type { RequestAuth } from '../../auth/auth.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { financeActor } from '../finance-access';
import { FinanceRoute } from '../finance-route';
import { CreateOpeningBalanceDto } from './dto/opening-balance.dto';
import { ListOpeningQueryDto } from './dto/list-opening.dto';
import { OpeningBalancesService } from './opening-balances.service';

@FinanceRoute('opening-balances')
export class OpeningBalancesController {
  constructor(private readonly openings: OpeningBalancesService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth, @Query() query: ListOpeningQueryDto) {
    const actor = financeActor(auth);
    const searching = Object.values(query).some((value) => value !== undefined && value !== '');
    return searching ? this.openings.search(actor, query) : this.openings.list(actor);
  }

  @Post()
  create(@CurrentAuth() auth: RequestAuth, @Body() body: CreateOpeningBalanceDto) {
    return this.openings.create(financeActor(auth, 'APPROVE'), body);
  }

  @Delete(':id')
  remove(@CurrentAuth() auth: RequestAuth, @Param('id') id: string) {
    return this.openings.remove(financeActor(auth, 'APPROVE'), id);
  }
}
