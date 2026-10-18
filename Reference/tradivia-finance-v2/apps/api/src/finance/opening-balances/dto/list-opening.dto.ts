import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ListOpeningQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsIn(['VAULT', 'SHAM_CASH'])
  fund?: 'VAULT' | 'SHAM_CASH';

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  currency?: 'USD' | 'SYP';

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  operationNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;
}
