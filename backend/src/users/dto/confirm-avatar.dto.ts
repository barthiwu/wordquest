import { IsString, MinLength, MaxLength } from 'class-validator';

export class ConfirmAvatarDto {
  /** Must be a key handed back by POST /users/me/avatar/upload-url for THIS user — UsersService.confirmAvatar verifies ownership before accepting it. */
  @IsString()
  @MaxLength(512)
  @MinLength(1)
  key!: string;
}
