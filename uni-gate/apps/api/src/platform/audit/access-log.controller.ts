import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { PlatformGuard } from '../platform.guard';
import { ListAccessLogQuery } from './access-log.dto';
import { AccessLogService } from './access-log.service';

@Controller('platform/access-log')
@UseGuards(AuthGuard, PlatformGuard)
export class AccessLogController {
  constructor(private readonly accessLog: AccessLogService) {}

  @Get()
  list(@Query() query: ListAccessLogQuery) {
    return this.accessLog.list(query);
  }
}
