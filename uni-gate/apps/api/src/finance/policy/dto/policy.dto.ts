import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsString, Matches, Min } from 'class-validator';
import { CURRENCY_CODES } from '../catalog';

export class CurrencyActiveDto {
  @IsBoolean()
  active!: boolean;
}

export class SaveRateDto {
  @IsIn(CURRENCY_CODES)
  code!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  rate!: number;
}
