import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch(UnauthorizedException)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = exception.getResponse();
    const payload =
      typeof body === 'object' && body
        ? body
        : { success: false, code: 'WRONG_CREDENTIALS' };
    response.status(401).json(payload);
  }
}
