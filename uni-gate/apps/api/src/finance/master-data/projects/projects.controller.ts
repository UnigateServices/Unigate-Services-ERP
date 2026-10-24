import { Body, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { RequestAuth } from '../../../auth/auth.service';
import { CurrentAuth } from '../../../auth/current-auth.decorator';
import { financeActor } from '../../finance-access';
import { FinanceRoute } from '../../finance-route';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@FinanceRoute('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentAuth() auth: RequestAuth) {
    return this.projects.list(financeActor(auth));
  }

  @Post()
  create(@CurrentAuth() auth: RequestAuth, @Body() body: CreateProjectDto) {
    return this.projects.create(financeActor(auth, 'APPROVE'), body);
  }

  @Patch(':id')
  update(@CurrentAuth() auth: RequestAuth, @Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.projects.update(financeActor(auth, 'APPROVE'), id, body);
  }

  @Delete(':id')
  remove(@CurrentAuth() auth: RequestAuth, @Param('id') id: string) {
    return this.projects.remove(financeActor(auth, 'APPROVE'), id);
  }
}
