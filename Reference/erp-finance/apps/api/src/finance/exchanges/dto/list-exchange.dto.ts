import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ListExchangeQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fund?: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsIn(['BUY', 'SELL'])
  exchangeType?: 'BUY' | 'SELL';

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  paidCurrency?: 'USD' | 'SYP';

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  receivedCurrency?: 'USD' | 'SYP';

  @IsOptional()
  @IsIn(['COMPLETED', 'PENDING_APPROVAL'])
  status?: 'COMPLETED' | 'PENDING_APPROVAL';

  @IsOptional()
  @IsString()
  bankId?: string;

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
  minTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxTotal?: number;
}
