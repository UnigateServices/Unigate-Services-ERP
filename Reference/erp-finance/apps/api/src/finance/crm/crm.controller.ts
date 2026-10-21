import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ActivityDto, LeadDto, OpportunityDto, QuoteDto, QuoteStatusDto } from './dto/crm.dto';
import { CrmService } from './crm.service';

const readers = [Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE, Role.MONITOR];
const writers = [Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE];

@Controller('crm')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('leads')
  @Roles(...readers)
  leads(@CurrentUser() user: AuthUser) {
    return this.crm.leads(user);
  }

  @Post('leads')
  @Roles(...writers)
  createLead(@CurrentUser() user: AuthUser, @Body() body: LeadDto) {
    return this.crm.createLead(user, body);
  }

  @Post('leads/:id/convert')
  @Roles(...writers)
  convert(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.convertLead(user, id);
  }

  @Get('opportunities')
  @Roles(...readers)
  opportunities(@CurrentUser() user: AuthUser) {
    return this.crm.opportunities(user);
  }

  @Post('opportunities')
  @Roles(...writers)
  createOpportunity(@CurrentUser() user: AuthUser, @Body() body: OpportunityDto) {
    return this.crm.createOpportunity(user, body);
  }

  @Patch('opportunities/:id')
  @Roles(...writers)
  updateOpportunity(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: OpportunityDto) {
    return this.crm.updateOpportunity(user, id, body);
  }

  @Get('activities')
  @Roles(...readers)
  activities(@CurrentUser() user: AuthUser) {
    return this.crm.activities(user);
  }

  @Post('activities')
  @Roles(...writers)
  createActivity(@CurrentUser() user: AuthUser, @Body() body: ActivityDto) {
    return this.crm.createActivity(user, body);
  }

  @Get('quotes')
  @Roles(...readers)
  quotes(@CurrentUser() user: AuthUser) {
    return this.crm.quotes(user);
  }

  @Get('quotes/:id')
  @Roles(...readers)
  quote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.quote(user, id);
  }

  @Post('quotes')
  @Roles(...writers)
  createQuote(@CurrentUser() user: AuthUser, @Body() body: QuoteDto) {
    return this.crm.createQuote(user, body);
  }

  @Post('quotes/:id/version')
  @Roles(...writers)
  revise(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.reviseQuote(user, id);
  }

  @Patch('quotes/:id/status')
  @Roles(...writers)
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: QuoteStatusDto) {
    return this.crm.setQuoteStatus(user, id, body);
  }

  @Post('quotes/:id/accept')
  @Roles(...writers)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.crm.acceptQuote(user, id);
  }
}
