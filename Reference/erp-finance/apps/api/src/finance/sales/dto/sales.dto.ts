import { Type } from 'class-transformer';
import { CURRENCY_CODES } from '../../policy/catalog';
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

export class CustomerDto {
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
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paymentTermDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class SalesLineDto {
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
  @IsIn(['AMOUNT', 'PERCENT'])
  discountMode?: 'AMOUNT' | 'PERCENT';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class SaveSalesInvoiceDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsString()
  customerId!: string;

  @IsString()
  warehouseId!: string;

  @IsIn(CURRENCY_CODES)
  currency!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(['AMOUNT', 'PERCENT'])
  discountMode?: 'AMOUNT' | 'PERCENT';

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
  @Type(() => SalesLineDto)
  lines!: SalesLineDto[];
}

export class PostDocumentDto {
  @IsOptional()
  @IsString()
  applyAdvanceId?: string;
}

export class VoidSalesInvoiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class SalesPaymentDto {
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

export class ListSalesQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'POSTED', 'VOID'])
  status?: 'DRAFT' | 'POSTED' | 'VOID';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
