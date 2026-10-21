import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export const MONITOR_TYPES = ['INCOME', 'OUTCOME', 'EXCHANGE', 'TRANSFER', 'ADVANCE'] as const;
export type MonitorType = (typeof MONITOR_TYPES)[number];

export class MonitorQueryDto {
  @IsOptional()
  @IsIn(MONITOR_TYPES)
  type?: MonitorType;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim() : undefined))
  @IsString()
  employeeId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim() : undefined))
  @IsString()
  employeeIds?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  sysFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  sysTo?: string;
}
