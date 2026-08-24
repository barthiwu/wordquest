import { IsIn } from 'class-validator';

export class SelectOrderDto {
  @IsIn(['SCRIBES', 'SEEKERS', 'ORATORS', 'ARTISANS'])
  order!: 'SCRIBES' | 'SEEKERS' | 'ORATORS' | 'ARTISANS';
}
