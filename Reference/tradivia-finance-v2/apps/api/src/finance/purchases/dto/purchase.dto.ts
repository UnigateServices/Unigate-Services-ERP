import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SupplierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class PurchaseLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class SavePurchaseInvoiceDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsString()
  supplierId!: string;

  @IsString()
  warehouseId!: string;

  @IsIn(['USD', 'SYP'])
  currency!: 'USD' | 'SYP';

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

export class VoidPurchaseInvoiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class PurchasePaymentDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount!: number;

  @IsString()
  projectId!: string;

  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fund!: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ListPurchaseQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'POSTED', 'VOID'])
  status?: 'DRAFT' | 'POSTED' | 'VOID';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
