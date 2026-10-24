import { Body, Get, Post } from '@nestjs/common';
import type { RequestAuth } from '../../auth/auth.service';
import { CurrentAuth } from '../../auth/current-auth.decorator';
import { financeActor } from '../finance-access';
import { FinanceRoute } from '../finance-route';
import { PostOpeningDto } from './dto/opening-entry.dto';
import { OpeningEntryService } from './opening-entry.service';

@FinanceRoute('opening-entry')
export class OpeningEntryController {
  constructor(private readonly opening: OpeningEntryService) {}

  @Get()
  current(@CurrentAuth() auth: RequestAuth) {
    return this.opening.current(financeActor(auth));
  }

  @Post('preview')
  preview(@CurrentAuth() auth: RequestAuth, @Body() body: PostOpeningDto) {
    return this.opening.preview(financeActor(auth, 'ADMIN'), body);
  }

  @Post()
  post(@CurrentAuth() auth: RequestAuth, @Body() body: PostOpeningDto) {
    return this.opening.post(financeActor(auth, 'ADMIN'), body);
  }
}
