import { Type } from 'class-transformer';
import {
  ArrayMinSize,
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

export class AssessInventoryLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitNrv!: number;
}

export class AssessInventoryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessInventoryLineDto)
  lines!: AssessInventoryLineDto[];
}
