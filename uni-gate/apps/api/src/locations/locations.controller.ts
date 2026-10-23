import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { CreateLocationDto, UpdateLocationDto } from './location.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(AuthGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.locations.listForSession(auth);
  }

  /** Company comes only from the session. Needs branches WRITE and all-branch scope. */
  @Post()
  create(@Body() body: CreateLocationDto, @CurrentAuth() auth: RequestAuth) {
    return this.locations.createForSession(auth, body.name);
  }

  @Patch(':locationId')
  update(@Param('locationId') locationId: string, @Body() body: UpdateLocationDto, @CurrentAuth() auth: RequestAuth) {
    return this.locations.updateForSession(auth, locationId, body);
  }
}
