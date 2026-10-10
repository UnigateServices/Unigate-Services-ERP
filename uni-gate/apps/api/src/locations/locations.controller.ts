import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(AuthGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.locations.listForSession(auth);
  }
}
