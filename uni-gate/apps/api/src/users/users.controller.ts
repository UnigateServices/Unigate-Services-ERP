import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { RequestAuth } from '../auth/auth.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @CurrentAuth() auth: RequestAuth,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.users.listForSession(auth, { page, pageSize, q });
  }

  @Post()
  create(@CurrentAuth() auth: RequestAuth, @Body() body: CreateUserDto) {
    return this.users.createForSession(auth, body);
  }

  @Get(':userId')
  get(@CurrentAuth() auth: RequestAuth, @Param('userId') userId: string) {
    return this.users.getForSession(auth, userId);
  }

  @Patch(':userId')
  update(@CurrentAuth() auth: RequestAuth, @Param('userId') userId: string, @Body() body: UpdateUserDto) {
    return this.users.updateForSession(auth, userId, body);
  }

  @Post(':userId/password')
  @HttpCode(204)
  reset(@CurrentAuth() auth: RequestAuth, @Param('userId') userId: string, @Body() body: ResetPasswordDto) {
    return this.users.resetForSession(auth, userId, body.password);
  }
}
