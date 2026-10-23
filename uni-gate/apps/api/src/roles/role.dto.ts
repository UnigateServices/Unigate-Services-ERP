import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  PERMISSION_AREAS,
  PERMISSION_LEVELS,
  allowedLevels,
  isPermissionArea,
  isPermissionLevel,
  type PermissionArea,
  type PermissionLevel,
} from '@unigate/shared';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class PermissionEntryDto {
  @IsIn(PERMISSION_AREAS as unknown as string[])
  area!: PermissionArea;

  @IsIn(PERMISSION_LEVELS as unknown as string[])
  level!: PermissionLevel;
}

/** Each area at most once, and each level allowed for its area (administration areas stop at WRITE). */
function IsPermissionList(options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isPermissionList',
      target: target.constructor,
      propertyName,
      options: { message: 'Each area once, with a level allowed for that area.', ...options },
      validator: {
        validate(value: unknown) {
          if (value === undefined) return true;
          if (!Array.isArray(value)) return false;
          const seen = new Set<string>();
          for (const entry of value) {
            if (!entry || typeof entry !== 'object') return false;
            const { area, level } = entry as { area?: unknown; level?: unknown };
            if (typeof area !== 'string' || typeof level !== 'string') return false;
            if (!isPermissionArea(area) || !isPermissionLevel(level)) return false;
            if (seen.has(area)) return false;
            seen.add(area);
            if (!allowedLevels(area).includes(level)) return false;
          }
          return true;
        },
      },
    });
  };
}

export class RoleBodyDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Matches(/^[A-Z][A-Z0-9_]{1,40}$/)
  key!: string;

  @IsIn(['OWN', 'BRANCH', 'ALL_BRANCHES'])
  visibilityScope!: 'OWN' | 'BRANCH' | 'ALL_BRANCHES';

  @IsBoolean()
  editRequiresApproval!: boolean;

  @IsBoolean()
  deleteRequiresApproval!: boolean;

  /** Optional. Supplied areas are replaced, the others keep their level. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PERMISSION_AREAS.length)
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  @IsPermissionList()
  permissions?: PermissionEntryDto[];
}
