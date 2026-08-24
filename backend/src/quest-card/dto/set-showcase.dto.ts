import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { MAX_SHOWCASE_CARDS } from '../quest-card.service';

export class SetShowcaseDto {
  @IsArray()
  @ArrayMaxSize(MAX_SHOWCASE_CARDS)
  @IsString({ each: true })
  cardIds!: string[];
}
