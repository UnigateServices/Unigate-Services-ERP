import { BadRequestException, ValidationError } from '@nestjs/common';
import { ErrorCode } from '@unigate/shared';

export function validationExceptionFactory(errors: ValidationError[]) {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Validation failed',
    details: errors.map(describeError),
  });
}

function describeError(error: ValidationError): { property: string; constraints?: Record<string, string>; children?: unknown[] } {
  return {
    property: error.property,
    constraints: error.constraints,
    children: error.children && error.children.length > 0 ? error.children.map(describeError) : undefined,
  };
}
