import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CURRENCY_CODES } from '../../policy/catalog';

export class OpeningItemDto {
  @IsIn(['CUSTOMER', 'SUPPLIER'])
  party!: 'CUSTOMER' | 'SUPPLIER';

  @IsString()
  @MaxLength(200)
  name!: string;

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

export class OpeningCustodyDto {
  @IsString()
  @MaxLength(200)
  borrowerName!: string;

  @IsIn(CURRENCY_CODES)
  currency!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  documentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  memo?: string;
}

export class OpeningAccountDto {
  @IsString()
  code!: string;

  @IsIn(CURRENCY_CODES)
  currency!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  debit!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  credit!: number;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class OpeningStockDto {
  @IsString()
  productId!: string;

  @IsString()
  warehouseId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class OpeningControlsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivables!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payables!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  customerAdvances!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  supplierAdvances!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allowance!: number;
}

export class PostOpeningDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  balanceDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  entryDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allowance!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  inventoryAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningItemDto)
  items!: OpeningItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningCustodyDto)
  custody?: OpeningCustodyDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningAccountDto)
  accounts!: OpeningAccountDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningStockDto)
  stock!: OpeningStockDto[];

  @ValidateNested()
  @Type(() => OpeningControlsDto)
  controls!: OpeningControlsDto;
}
