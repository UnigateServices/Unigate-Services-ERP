import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

function emptyNumber({ value }: { value: unknown }) {
  if (value === '' || value === null || value === undefined) return null;
  return Number(value);
}

const UNITS = ['PIECE', 'KG', 'METER', 'LITER', 'BOX', 'SET'] as const;
const MOVES = ['IN', 'OUT', 'ADJUST'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class CreateWarehouseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsIn(UNITS)
  unit?: (typeof UNITS)[number];

  @IsOptional()
  @Transform(emptyNumber)
  @ValidateIf((_, obj) => obj?.costPrice != null)
  @IsNumber()
  @Min(0)
  costPrice?: number | null;

  @IsOptional()
  @Transform(emptyNumber)
  @ValidateIf((_, obj) => obj?.salePrice != null)
  @IsNumber()
  @Min(0)
  salePrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsIn(UNITS)
  unit?: (typeof UNITS)[number];

  @IsOptional()
  @Transform(emptyNumber)
  @ValidateIf((_, obj) => obj?.costPrice != null)
  @IsNumber()
  @Min(0)
  costPrice?: number | null;

  @IsOptional()
  @Transform(emptyNumber)
  @ValidateIf((_, obj) => obj?.salePrice != null)
  @IsNumber()
  @Min(0)
  salePrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export class CatalogQueryDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(['all', 'available', 'low', 'out', 'inactive'])
  filter?: 'all' | 'available' | 'low' | 'out' | 'inactive';
}

export class CreateStockMoveDto {
  @IsString()
  productId!: string;

  @IsString()
  warehouseId!: string;

  @IsIn(MOVES)
  moveType!: (typeof MOVES)[number];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListMovesQueryDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsIn(MOVES)
  moveType?: (typeof MOVES)[number];
}
