import { IsString, MaxLength } from 'class-validator';

export class CreateMissionDto {
  @IsString()
  @MaxLength(64)
  wordId!: string;
}
