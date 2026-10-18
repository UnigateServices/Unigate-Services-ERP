import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateExchangeDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fund!: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsIn(['BUY', 'SELL'])
  exchangeType!: 'BUY' | 'SELL';

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeAmount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRate!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
