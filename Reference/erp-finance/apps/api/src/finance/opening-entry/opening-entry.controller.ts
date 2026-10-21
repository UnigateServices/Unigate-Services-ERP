import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { PostOpeningDto } from './dto/opening-entry.dto';
import { OpeningEntryService } from './opening-entry.service';

@Controller('opening-entry')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OpeningEntryController {
  constructor(private readonly opening: OpeningEntryService) {}

  @Get()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.MONITOR)
  current() {
    return this.opening.current();
  }

  @Post('preview')
  @Roles(Role.GENERAL_MANAGER)
  preview(@CurrentUser() user: AuthUser, @Body() body: PostOpeningDto) {
    return this.opening.preview(user, body);
  }

  @Post()
  @Roles(Role.GENERAL_MANAGER)
  post(@CurrentUser() user: AuthUser, @Body() body: PostOpeningDto) {
    return this.opening.post(user, body);
  }
}
