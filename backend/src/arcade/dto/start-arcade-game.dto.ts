import { IsOptional, IsString, IsUUID } from 'class-validator';

/** Body of a game's `start` route. Empty for a solo play; carries the
 * match id when the player is opening their half of a head-to-head match. */
export class StartArcadeGameDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  versusMatchId?: string;

  /** Set when the player is opening their play in a Group Play round. */
  @IsOptional()
  @IsString()
  @IsUUID()
  groupId?: string;
}
