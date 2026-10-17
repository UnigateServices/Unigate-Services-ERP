import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function emptyToNull(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateUserDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((object: { email?: string | null }) => object.email !== null && object.email !== undefined)
  @IsString()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((object: { phone?: string | null }) => object.phone !== null && object.phone !== undefined)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsString()
  @MinLength(1)
  roleId!: string;

  @Transform(({ value }) => (value === undefined ? null : emptyToNull(value)))
  @ValidateIf((object: { locationId?: string | null }) => object.locationId !== null && object.locationId !== undefined)
  @IsString()
  @MinLength(1)
  locationId!: string | null;
}

export class UpdateUserDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((object: { email?: string | null }) => object.email !== null && object.email !== undefined)
  @IsString()
  @MaxLength(160)
  email!: string | null;

  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((object: { phone?: string | null }) => object.phone !== null && object.phone !== undefined)
  @IsString()
  @MaxLength(40)
  phone!: string | null;

  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';

  @IsString()
  @MinLength(1)
  roleId!: string;

  @Transform(({ value }) => (value === undefined ? null : emptyToNull(value)))
  @ValidateIf((object: { locationId?: string | null }) => object.locationId !== null && object.locationId !== undefined)
  @IsString()
  @MinLength(1)
  locationId!: string | null;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
