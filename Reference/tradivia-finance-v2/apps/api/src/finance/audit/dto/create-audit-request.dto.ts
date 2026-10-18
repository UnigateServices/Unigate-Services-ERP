import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmptyObject,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class OperationPatchDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fund?: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiver?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliverer?: string;

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  currency?: 'USD' | 'SYP';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(['BUY', 'SELL'])
  exchangeType?: 'BUY' | 'SELL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  fxRate?: number;

  @IsOptional()
  @IsIn(['VAULT', 'SHAM_CASH', 'BANK'])
  fromFund?: 'VAULT' | 'SHAM_CASH' | 'BANK';

  @IsOptional()
  @IsIn(['VAULT', 'SHAM_CASH', 'BANK', 'ADVANCES'])
  toFund?: 'VAULT' | 'SHAM_CASH' | 'BANK' | 'ADVANCES';

  @IsOptional()
  @IsString()
  fromBankId?: string;

  @IsOptional()
  @IsString()
  toBankId?: string;

  @IsOptional()
  @IsString()
  borrowerId?: string;

  @IsOptional()
  @IsIn(['OUTCOME', 'EXCHANGE'])
  advanceType?: 'OUTCOME' | 'EXCHANGE';

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  fromCurrency?: 'USD' | 'SYP';

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  toCurrency?: 'USD' | 'SYP';

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class CreateAuditRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  reference!: string;

  @IsIn(['DELETE', 'UPDATE'])
  actionType!: 'DELETE' | 'UPDATE';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ValidateIf((body: CreateAuditRequestDto) => body.actionType === 'UPDATE')
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => OperationPatchDto)
  patch?: OperationPatchDto;
}
