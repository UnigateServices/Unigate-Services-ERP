import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { PlatformGuard } from '../platform/platform.guard';
import { UpdateModulesDto } from './module.dto';
import { ModulesService } from './modules.service';

@Controller('platform/companies/:companyId/modules')
@UseGuards(AuthGuard, PlatformGuard)
export class PlatformModulesController {
  constructor(private readonly modules: ModulesService) {}

  @Get()
  list(@Param('companyId') companyId: string) {
    return this.modules.listForCompany(companyId);
  }

  @Put()
  replace(
    @Param('companyId') companyId: string,
    @Body() body: UpdateModulesDto,
    @CurrentAuth() auth: RequestAuth,
  ) {
    return this.modules.replace(companyId, body.modules, auth.userId);
  }
}
