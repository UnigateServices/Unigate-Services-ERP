import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CollectOpenItemDto, CreateOpenItemDto, RevalueOpenItemsDto } from './dto/open-item.dto';
import { OpenItemsService } from './open-items.service';

const readers = [Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR];
const writers = [Role.GENERAL_MANAGER, Role.SUPERVISOR];

@Controller('open-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OpenItemsController {
  constructor(private readonly items: OpenItemsService) {}

  @Get()
  @Roles(...readers)
  list() {
    return this.items.list();
  }

  @Post()
  @Roles(...writers)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateOpenItemDto) {
    return this.items.create(user, body);
  }

  @Delete(':id')
  @Roles(...writers)
  remove(@Param('id') id: string) {
    return this.items.remove(id);
  }

  @Get('statement/:partyId')
  @Roles(...readers)
  statement(@Param('partyId') partyId: string) {
    return this.items.statement(partyId);
  }

  @Get('aging')
  @Roles(...readers)
  aging(@Query('asOf') asOf?: string) {
    return this.items.aging(asOf || '');
  }

  @Post(':id/collect')
  @Roles(...writers, Role.EMPLOYEE)
  collect(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CollectOpenItemDto) {
    return this.items.collect(user, id, body);
  }

  @Post('revalue-preview')
  @Roles(...readers)
  revaluePreview(@Body() body: RevalueOpenItemsDto) {
    return this.items.revaluePreview(body);
  }
}
