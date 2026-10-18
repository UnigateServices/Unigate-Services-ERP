import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'tradivia-finance-api',
      version: '0.1.0',
    };
  }
}
