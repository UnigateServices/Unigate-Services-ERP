import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class JournalLineDto {
  @IsString()
  accountId!: string;

  @IsIn(['USD', 'SYP'])
  currency!: 'USD' | 'SYP';

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
  @MaxLength(300)
  memo?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;
}

export class JournalEntryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  post?: boolean;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class ReverseJournalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AccountStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

export class UpdateAccountDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  statementLine?: string;
}

export class CreateAccountDto {
  @IsString()
  @MaxLength(20)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'])
  type!: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  statementLine?: string;
}
