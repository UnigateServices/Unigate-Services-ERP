import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformGuard } from '../platform/platform.guard';
import { PlatformRolesController } from './platform-roles.controller';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [AuthModule],
  controllers: [PlatformRolesController, RolesController],
  providers: [RolesService, PlatformGuard],
})
export class RolesModule {}
