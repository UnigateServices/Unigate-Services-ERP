import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateOpeningBalanceDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transactionDate!: string;

  @IsString()
  employeeId!: string;

  @IsIn(['VAULT', 'SHAM_CASH'])
  fund!: 'VAULT' | 'SHAM_CASH';

  @IsIn(['USD', 'SYP'])
  currency!: 'USD' | 'SYP';

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
