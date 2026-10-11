import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class RoleBodyDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Matches(/^[A-Z][A-Z0-9_]{1,40}$/)
  key!: string;

  @IsBoolean()
  canManageUsers!: boolean;

  @IsIn(['OWN', 'BRANCH', 'ALL_BRANCHES'])
  visibilityScope!: 'OWN' | 'BRANCH' | 'ALL_BRANCHES';

  @IsBoolean()
  editRequiresApproval!: boolean;

  @IsBoolean()
  deleteRequiresApproval!: boolean;
}
