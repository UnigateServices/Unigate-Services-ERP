import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformGuard } from '../platform/platform.guard';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { PlatformLocationsController } from './platform-locations.controller';

@Module({
  imports: [AuthModule],
  controllers: [PlatformLocationsController, LocationsController],
  providers: [LocationsService, PlatformGuard],
})
export class LocationsModule {}
