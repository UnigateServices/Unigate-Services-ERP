import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CookieService } from './cookie.service';
import { CurrentAuth } from './current-auth.decorator';
import { ChangePasswordDto, MemberLoginDto, PlatformLoginDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import type { RequestAuth } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly cookies: CookieService,
  ) {}

  @Post('platform/login')
  @HttpCode(200)
  async platformLogin(@Body() body: PlatformLoginDto, @Res({ passthrough: true }) response: Response) {
    const token = await this.auth.loginPlatform(body.username, body.password);
    this.cookies.attach(response, token);
    return { ok: true };
  }

  @Post('login')
  @HttpCode(200)
  async memberLogin(@Body() body: MemberLoginDto, @Res({ passthrough: true }) response: Response) {
    const token = await this.auth.loginMember(body.companyCode, body.username, body.password);
    this.cookies.attach(response, token);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response) {
    this.cookies.clear(response);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentAuth() auth: RequestAuth) {
    return this.auth.me(auth);
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async changePassword(
    @CurrentAuth() auth: RequestAuth,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.passwords.changeOwn(auth.userId, body.currentPassword, body.newPassword);
    this.cookies.clear(response);
  }
}
