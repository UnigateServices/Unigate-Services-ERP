import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { attachAccessCookie, clearAccessCookie } from './cookies';

@Injectable()
export class CookieService {
  constructor(private readonly config: ConfigService) {}

  get secure(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  attach(response: Response, token: string) {
    attachAccessCookie(response, token, this.secure);
  }

  clear(response: Response) {
    clearAccessCookie(response, this.secure);
  }
}
