import { IsString, IsUUID } from 'class-validator';

export class InviteDuelFriendDto {
  @IsString()
  @IsUUID()
  friendId!: string;
}
