import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ANALYTICS_EVENT_NAMES } from '../event-names';

/**
 * One client-submitted telemetry event (Telemetry spec §5/§23). Mirrors
 * the client's AnalyticsClient queue entry shape.
 *
 * eventName is validated against the controlled vocabulary at the DTO
 * layer too (not just in AnalyticsService) so a malformed/unknown name
 * fails loudly in dev/CI rather than silently dropping — the service's
 * own filtering is the production safety net for a stale client build
 * sending an event name this backend no longer recognizes.
 */
export class AnalyticsEventDto {
  @IsUUID()
  clientEventId!: string;

  @IsIn(ANALYTICS_EVENT_NAMES)
  eventName!: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  screen?: string;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

/**
 * POST /api/v1/analytics/events request body — a batch, never one
 * event per request (spec §24: "Don't make an HTTP request for every
 * tap"). platform/appVersion describe the whole batch (the app that
 * sent it), not each event.
 */
export class SubmitAnalyticsEventsDto {
  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  events!: AnalyticsEventDto[];
}
