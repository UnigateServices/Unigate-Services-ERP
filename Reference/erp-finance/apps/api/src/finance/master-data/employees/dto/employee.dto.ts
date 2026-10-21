import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(200)
  password!: string;

  @IsIn(['EMPLOYEE', 'SUPERVISOR', 'GENERAL_MANAGER', 'MONITOR'])
  role!: 'EMPLOYEE' | 'SUPERVISOR' | 'GENERAL_MANAGER' | 'MONITOR';

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsIn(['EMPLOYEE', 'SUPERVISOR', 'GENERAL_MANAGER', 'MONITOR'])
  role?: 'EMPLOYEE' | 'SUPERVISOR' | 'GENERAL_MANAGER' | 'MONITOR';

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  accountStatus?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsString()
  locationId?: string;
}
