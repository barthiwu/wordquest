import { IsIn } from 'class-validator';

export class PhotoUploadUrlDto {
  @IsIn(['image/jpeg', 'image/png'])
  contentType!: 'image/jpeg' | 'image/png';
}
