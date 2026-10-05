import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VocabularyAlternativesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  word!: string;
}
