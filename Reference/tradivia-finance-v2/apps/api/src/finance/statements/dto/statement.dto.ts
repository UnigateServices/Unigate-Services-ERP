import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InventoryMethodDto {
  @IsIn(['WAC'])
  inventoryMethod!: 'WAC';
}

export class RevaluationDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOf!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  rate!: number;
}

export class FunctionalCurrencyDto {
  @IsIn(['USD', 'SYP'])
  functionalCurrency!: 'USD' | 'SYP';
}

export class StatementQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOf?: string;

  @IsOptional()
  @IsIn(['USD', 'SYP', 'FUNCTIONAL'])
  currency?: 'USD' | 'SYP' | 'FUNCTIONAL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  rate?: number;

  @IsOptional()
  @IsString()
  costCenterId?: string;
}

export class BudgetLineDto {
  @IsString()
  accountId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;
}

export class SaveBudgetDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsIn(['USD', 'SYP'])
  currency!: 'USD' | 'SYP';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines!: BudgetLineDto[];
}

export class BudgetStatusDto {
  @IsIn(['DRAFT', 'ACTIVE'])
  status!: 'DRAFT' | 'ACTIVE';
}
