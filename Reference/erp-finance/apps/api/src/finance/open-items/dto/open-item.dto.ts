import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CURRENCY_CODES } from '../../policy/catalog';

export class CreateOpenItemDto {
  @IsIn(['CUSTOMER', 'SUPPLIER'])
  party!: 'CUSTOMER' | 'SUPPLIER';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsIn(['RECEIVABLE', 'PAYABLE', 'ADVANCE_IN'])
  kind!: 'RECEIVABLE' | 'PAYABLE' | 'ADVANCE_IN';

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  documentDate!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;

  @IsIn(CURRENCY_CODES)
  currency!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsIn(['CASH', 'GOODS'])
  settlementMode!: 'CASH' | 'GOODS';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;
}

export class CollectOpenItemDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fund!: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsString()
  projectId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RevalueOpenItemsDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOf!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  rate?: number;
}
