import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MaxLength(512)
  @IsNotEmpty()
  token!: string;

  @IsIn(['ios', 'android'])
  platform!: string;
}
