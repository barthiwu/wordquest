import { IsBoolean, IsIn, IsString, IsUUID } from 'class-validator';
import { ARCADE_VERSUS_GAMES } from '../../config/arcade.config';

export class QueueVersusDto {
  @IsIn([...ARCADE_VERSUS_GAMES])
  game!: (typeof ARCADE_VERSUS_GAMES)[number];
}

export class InviteVersusDto {
  @IsString()
  @IsUUID()
  friendId!: string;

  @IsIn([...ARCADE_VERSUS_GAMES])
  game!: (typeof ARCADE_VERSUS_GAMES)[number];
}

export class RespondVersusDto {
  @IsBoolean()
  accept!: boolean;
}
