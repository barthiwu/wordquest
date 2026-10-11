import { IsString, Length, Matches, MaxLength } from 'class-validator';
import { USERNAME_REGEX } from '../../users/users.service';

export class SendFriendRequestDto {
  @IsString()
  @MaxLength(64)
  @Length(3, 20)
  @Matches(USERNAME_REGEX)
  username!: string;
}
