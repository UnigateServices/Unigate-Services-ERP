import { IsIn } from 'class-validator';

export class DecideAuditRequestDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';
}
