import { IsArray, IsIn, IsOptional } from 'class-validator';
import { CreateNamedRecordDto, UpdateNamedRecordDto } from '../../dto/named-record.dto';

export const PROJECT_SHOW_IN = ['INCOME', 'OUTCOME', 'LOANS', 'REPORTS'] as const;
export type ProjectShowIn = (typeof PROJECT_SHOW_IN)[number];

export class CreateProjectDto extends CreateNamedRecordDto {
  @IsOptional()
  @IsArray()
  @IsIn(PROJECT_SHOW_IN, { each: true })
  showIn?: ProjectShowIn[];
}

export class UpdateProjectDto extends UpdateNamedRecordDto {
  @IsOptional()
  @IsArray()
  @IsIn(PROJECT_SHOW_IN, { each: true })
  showIn?: ProjectShowIn[];
}
