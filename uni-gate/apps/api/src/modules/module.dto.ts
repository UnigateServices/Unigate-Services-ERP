import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { MODULE_KEYS, type ModuleKey } from '@unigate/shared';

export class ModuleFlagDto {
  @IsIn(MODULE_KEYS)
  key!: ModuleKey;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateModulesDto {
  @IsArray()
  @ArrayUnique((item: ModuleFlagDto) => item.key)
  @ValidateNested({ each: true })
  @Type(() => ModuleFlagDto)
  modules!: ModuleFlagDto[];
}
