import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ListAdvanceQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsIn(['OUTCOME', 'EXCHANGE'])
  advanceType?: 'OUTCOME' | 'EXCHANGE';

  @IsOptional()
  @IsIn(['USD', 'SYP'])
  currency?: 'USD' | 'SYP';

  @IsOptional()
  @IsIn(['COMPLETED', 'PENDING_APPROVAL'])
  status?: 'COMPLETED' | 'PENDING_APPROVAL';

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  borrowerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiver?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  operationNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxTotal?: number;
}
