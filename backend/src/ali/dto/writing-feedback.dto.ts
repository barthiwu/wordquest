import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WritingFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;
}
