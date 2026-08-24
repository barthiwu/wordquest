import { IsString, MinLength } from 'class-validator';

// localDate is no longer client-submitted (Player Timezone System, V1
// Remaining Systems Spec §15) — the controller derives it server-side via
// PlayerClockService.
export class SubmitMasterChallengeDto {
  @IsString()
  @MinLength(1)
  paragraph!: string;
}
