import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateIncomeDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fund!: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiver?: string;

  @IsIn(['USD', 'SYP'])
  currency!: 'USD' | 'SYP';

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
  @Min(0.000001)
  fxRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
