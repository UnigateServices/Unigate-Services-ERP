import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateAdvanceDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsString()
  borrowerId!: string;

  @IsIn(['OUTCOME', 'EXCHANGE', 'ISSUE', 'RETURN'])
  advanceType!: 'OUTCOME' | 'EXCHANGE' | 'ISSUE' | 'RETURN';

  /** Cash fund of an ISSUE (custody leaves it) or RETURN (custody comes back to it). */
  @IsOptional()
  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fund?: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiver?: string;

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  currency?: 'USD' | 'SYP';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  fromCurrency?: 'USD' | 'SYP';

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  toCurrency?: 'USD' | 'SYP';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
