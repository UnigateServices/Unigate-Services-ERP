import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PasswordService, SessionService, CookieService],
  exports: [AuthService, AuthGuard, PasswordService, SessionService, CookieService],
})
export class AuthModule {}
