import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AssessInventoryDto } from './dto/assess-inventory.dto';
import { InventoryNrvService } from './inventory-nrv.service';

@Controller('inventory-nrv')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
export class InventoryNrvController {
  constructor(private readonly nrv: InventoryNrvService) {}

  @Get()
  preview() {
    return this.nrv.preview();
  }

  @Post()
  assess(@CurrentUser() user: AuthUser, @Body() body: AssessInventoryDto) {
    return this.nrv.assess(user, body);
  }
}
