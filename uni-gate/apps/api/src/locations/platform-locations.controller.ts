import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { PlatformGuard } from '../platform/platform.guard';
import { CreateLocationDto, UpdateLocationDto } from './location.dto';
import { LocationsService } from './locations.service';

@Controller('platform/companies/:companyId/locations')
@UseGuards(AuthGuard, PlatformGuard)
export class PlatformLocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(@Param('companyId') companyId: string) {
    return this.locations.listForCompany(companyId);
  }

  @Post()
  create(
    @Param('companyId') companyId: string,
    @Body() body: CreateLocationDto,
    @CurrentAuth() auth: RequestAuth,
  ) {
    return this.locations.create(companyId, body.name, auth.userId);
  }

  @Patch(':locationId')
  update(
    @Param('companyId') companyId: string,
    @Param('locationId') locationId: string,
    @Body() body: UpdateLocationDto,
    @CurrentAuth() auth: RequestAuth,
  ) {
    return this.locations.update(companyId, locationId, body, auth.userId);
  }
}
