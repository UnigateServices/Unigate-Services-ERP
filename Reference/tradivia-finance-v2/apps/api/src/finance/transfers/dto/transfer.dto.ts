import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fromFund!: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsIn(['VAULT', 'SHAM_CASH', 'BANK', 'ADVANCES'])
  toFund!: 'VAULT' | 'SHAM_CASH' | 'BANK' | 'ADVANCES';

  @IsOptional()
  @IsString()
  fromBankId?: string;

  @IsOptional()
  @IsString()
  toBankId?: string;

  @IsIn(['USD', 'SYP'])
  currency!: 'USD' | 'SYP';

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
  borrowerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
