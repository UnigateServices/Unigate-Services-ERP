import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
