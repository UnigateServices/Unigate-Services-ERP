import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export const REPORT_IDS = [
  'overview',
  'income',
  'outcome',
  'exchange',
  'transfer',
  'advances',
  'funds',
  'borrower',
  'staff',
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

export const REPORT_PERIODS = ['today', 'week', 'month', 'all', 'custom'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

const optionalTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export class RunReportDto {
  @IsIn(REPORT_IDS)
  reportId!: ReportId;

  @IsOptional()
  @IsIn(REPORT_PERIODS)
  period?: ReportPeriod;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  employeeId?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  currency?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  fund?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  projectId?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  borrowerId?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  status?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  exchangeType?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  advanceType?: string;
}
