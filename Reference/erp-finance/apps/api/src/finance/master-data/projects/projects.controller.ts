import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { Roles } from '../../../auth/roles.decorator';
import { RolesGuard } from '../../../auth/roles.guard';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR, Role.EMPLOYEE)
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  @Post()
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  create(@Body() body: CreateProjectDto) {
    return this.projects.create(body);
  }

  @Patch(':id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  update(@Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.projects.update(id, body);
  }

  @Delete(':id')
  @Roles(Role.GENERAL_MANAGER, Role.SUPERVISOR)
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }
}
