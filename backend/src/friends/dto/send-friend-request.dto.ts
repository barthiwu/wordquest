import { IsString, Length, Matches } from 'class-validator';
import { USERNAME_REGEX } from '../../users/users.service';

export class SendFriendRequestDto {
  @IsString()
  @Length(3, 20)
  @Matches(USERNAME_REGEX)
  username!: string;
}
