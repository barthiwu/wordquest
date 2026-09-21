import { IsIn } from 'class-validator';

export class AvatarUploadUrlDto {
  @IsIn(['image/jpeg', 'image/png'])
  contentType!: 'image/jpeg' | 'image/png';
}
