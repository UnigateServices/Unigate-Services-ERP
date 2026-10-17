import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformGuard } from '../platform/platform.guard';
import { PlatformUsersController } from './platform-users.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [PlatformUsersController, UsersController],
  providers: [UsersService, PlatformGuard],
})
export class UsersModule {}
