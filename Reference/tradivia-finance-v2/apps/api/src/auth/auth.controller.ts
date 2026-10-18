import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthExceptionFilter } from './auth-exception.filter';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { UnlockDto } from './dto/unlock.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ACCESS_COOKIE } from './jwt.strategy';
import { SCREEN_LOCK_ENABLED } from './screen-lock';

@Controller('auth')
@UseFilters(AuthExceptionFilter)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('login-users')
  loginUsers(@Query('audience') audience?: 'all' | 'employee' | 'supervisor') {
    return this.auth.listLoginNames(audience ?? 'all');
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.username, body.password);
    response.cookie(ACCESS_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });
    return result;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(ACCESS_COOKIE, { path: '/' });
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { ok: true, locked: SCREEN_LOCK_ENABLED && user.sessionLocked, user };
  }

  @Post('lock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  lock(@CurrentUser() user: AuthUser) {
    if (!SCREEN_LOCK_ENABLED) return { success: true as const, locked: false as const };
    return this.auth.lockSession(user);
  }

  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  unlock(@CurrentUser() user: AuthUser, @Body() body: UnlockDto) {
    return this.auth.unlockSession(user, body.password);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(user, body.currentPassword, body.newPassword);
  }
}
