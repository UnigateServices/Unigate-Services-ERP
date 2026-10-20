import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { ModuleAccessGuard, RequireEnabledModule } from './module-access.guard';
import { ModulesService } from './modules.service';

@Controller('modules')
@UseGuards(AuthGuard)
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.modules.listForSession(auth);
  }

  @Get(':key')
  @UseGuards(ModuleAccessGuard)
  @RequireEnabledModule()
  get(@CurrentAuth() auth: RequestAuth, @Param('key') key: string) {
    return this.modules.getForSession(auth, key);
  }
}
