import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MODULE_KEYS, type ModuleKey } from '@unigate/shared';

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

@ValidatorConstraint({ name: 'calendarDate', async: false })
class CalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isCalendarDate(value);
  }
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function normalizeMoney(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === 'string') return value.trim();
  return value;
}

export class ListCompaniesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

export class CreateCompanyDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Transform(({ value }) => normalizeCode(value))
  @Matches(/^[a-z0-9-]{2,32}$/)
  code!: string;

  @Transform(({ value }) => normalizeMoney(value))
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  priceUsd!: string;

  @Validate(CalendarDateConstraint)
  expiresOn!: string;

  @IsIn(['tradivia', 'simple'])
  preset!: 'tradivia' | 'simple';

  @IsArray()
  @ArrayUnique()
  @IsIn(MODULE_KEYS, { each: true })
  modules: ModuleKey[] = [];
}

export class UpdateCompanyDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Transform(({ value }) => normalizeCode(value))
  @Matches(/^[a-z0-9-]{2,32}$/)
  code!: string;

  @Transform(({ value }) => normalizeMoney(value))
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  priceUsd!: string;

  @Validate(CalendarDateConstraint)
  expiresOn!: string;
}

export class ActivateCompanyDto {
  @Validate(CalendarDateConstraint)
  expiresOn!: string;
}
