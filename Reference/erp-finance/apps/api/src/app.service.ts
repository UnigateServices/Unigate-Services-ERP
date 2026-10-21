import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'unigate-erp-finance-api',
      version: '0.1.0',
    };
  }
}
