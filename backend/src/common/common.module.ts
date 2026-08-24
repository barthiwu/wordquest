import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PlayerClockService } from './player-clock.service';
import { MonitoringService } from './monitoring.service';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

/** Shared, cross-cutting providers available everywhere without each module re-declaring them. */
@Global()
@Module({
  providers: [
    PlayerClockService,
    MonitoringService,
    // APP_FILTER registers this as the global exception filter for
    // every route in the app — the NestJS-idiomatic way to do this via
    // DI (so AllExceptionsFilter can inject MonitoringService), rather
    // than app.useGlobalFilters(new AllExceptionsFilter(...)) in
    // main.ts, which would need to construct it outside the DI
    // container.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [PlayerClockService, MonitoringService],
})
export class CommonModule {}
