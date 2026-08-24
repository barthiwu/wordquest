import { IsNotEmpty, IsString } from 'class-validator';

export class VocabularyAlternativesDto {
  @IsString()
  @IsNotEmpty()
  word!: string;
}
