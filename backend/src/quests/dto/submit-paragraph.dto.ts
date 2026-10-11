import { IsString, MinLength, MaxLength } from 'class-validator';

export class SubmitParagraphDto {
  @IsString()
  @MaxLength(2000)
  @MinLength(1)
  paragraph!: string;
}
