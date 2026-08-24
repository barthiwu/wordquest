import { IsString } from 'class-validator';

export class CreateMissionDto {
  @IsString()
  wordId!: string;
}
