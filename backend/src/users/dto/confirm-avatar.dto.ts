import { IsString, MinLength } from 'class-validator';

export class ConfirmAvatarDto {
  /** Must be a key handed back by POST /users/me/avatar/upload-url for THIS user — UsersService.confirmAvatar verifies ownership before accepting it. */
  @IsString()
  @MinLength(1)
  key!: string;
}
