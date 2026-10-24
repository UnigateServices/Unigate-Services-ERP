import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformGuard } from '../platform/platform.guard';
import { ModuleAccessGuard } from './module-access.guard';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { PlatformModulesController } from './platform-modules.controller';

@Module({
  imports: [AuthModule],
  controllers: [PlatformModulesController, ModulesController],
  providers: [ModulesService, PlatformGuard, ModuleAccessGuard],
  exports: [ModulesService, ModuleAccessGuard],
})
export class ModulesModule {}
