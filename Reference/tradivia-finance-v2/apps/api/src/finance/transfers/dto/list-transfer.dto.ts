import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ListTransferQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsIn(['VAULT', 'SHAM_CASH', 'BANK', 'ADVANCES'])
  fromFund?: 'VAULT' | 'SHAM_CASH' | 'BANK' | 'ADVANCES';

  @IsOptional()
  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  toFund?: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  currency?: 'USD' | 'SYP';

  @IsOptional()
  @IsIn(['COMPLETED', 'PENDING_APPROVAL'])
  status?: 'COMPLETED' | 'PENDING_APPROVAL';

  @IsOptional()
  @IsString()
  fromBankId?: string;

  @IsOptional()
  @IsString()
  toBankId?: string;

  @IsOptional()
  @IsString()
  borrowerId?: string;

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
