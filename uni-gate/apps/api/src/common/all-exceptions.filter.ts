import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@unigate/shared';
import type { Response } from 'express';

type ErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const parsed = readBody(body, status);
      response.status(status).json(parsed);
      return;
    }

    console.error(exception instanceof Error ? exception.stack : 'Unhandled error');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ErrorCode.INTERNAL,
      message: 'Something went wrong.',
    });
  }
}

function readBody(body: string | object, status: number): ErrorBody {
  if (typeof body === 'string') {
    return { code: codeForStatus(status), message: body };
  }
  if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
    const message = 'message' in body && typeof body.message === 'string' ? body.message : 'Request failed';
    const details = 'details' in body ? body.details : undefined;
    return details === undefined ? { code: body.code, message } : { code: body.code, message, details };
  }
  // Finance errors carry their code as the message (for example BadRequestException('PERIOD_CLOSED')).
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' && FINANCE_CODE.test(body.message)) {
    return { code: body.message, message: body.message };
  }
  return {
    code: codeForStatus(status),
    message: 'Request failed',
  };
}

const FINANCE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

function codeForStatus(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) return ErrorCode.VALIDATION_ERROR;
  if (status === HttpStatus.UNAUTHORIZED) return ErrorCode.UNAUTHORIZED;
  if (status === HttpStatus.FORBIDDEN) return ErrorCode.FORBIDDEN;
  if (status === HttpStatus.NOT_FOUND) return ErrorCode.NOT_FOUND;
  if (status === HttpStatus.CONFLICT) return ErrorCode.CONFLICT;
  return ErrorCode.INTERNAL;
}
