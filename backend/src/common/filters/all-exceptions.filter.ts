import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { MonitoringService } from '../monitoring.service';

/**
 * Catches every exception NestJS's own HTTP layer doesn't already turn
 * into a clean response — the single choke point error tracking (V20
 * Beta Release Checklist §13) hangs off, so no controller/service needs
 * its own try/catch just to report a failure.
 *
 * A recognized HttpException (BadRequestException, UnauthorizedException,
 * NotFoundException, etc. — the normal, expected "this request was
 * invalid" cases already thrown all over this codebase) is NOT reported
 * to Sentry: it already produces its own correct status/body, and an
 * expected 4xx from bad input is not a bug to alert on. Only a genuine
 * unhandled error (a 5xx, a thrown non-HttpException) gets captured —
 * exactly the class of failure "error tracking" exists to catch.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly monitoring: MonitoringService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    // V22 §15 crash-testing finding: an oversized request body never
    // reaches Nest's routing/validation layer at all — body-parser
    // middleware rejects it first with a plain `http-errors` object
    // (PayloadTooLargeError, status 413), not a NestJS HttpException.
    // Without this, every such request fell through to the generic
    // "Internal server error" 500 branch below — a working rejection,
    // just mis-categorized as a server bug instead of the client error
    // it actually is. Same reasoning covers any other body-parser-level
    // error (e.g. malformed URL encoding) that already carries its own
    // valid HTTP status.
    const middlewareStatus = this.middlewareStatus(exception);
    const status = isHttpException
      ? exception.getStatus()
      : (middlewareStatus ?? HttpStatus.INTERNAL_SERVER_ERROR);
    const body = isHttpException
      ? exception.getResponse()
      : middlewareStatus
        ? { statusCode: middlewareStatus, message: this.messageOf(exception) }
        : { statusCode: status, message: 'Internal server error' };

    // Only genuinely unexpected failures are reported — an expected 4xx
    // (validation failure, not-found, unauthorized, a rejected oversized
    // body) is normal request handling, not something to alert on.
    if ((!isHttpException && !middlewareStatus) || status >= 500) {
      this.monitoring.captureException(exception, {
        method: request.method,
        path: request.url,
      });
    }

    response.status(status).json(
      typeof body === 'object' && body !== null
        ? { ...body, path: request.url, timestamp: new Date().toISOString() }
        : {
            statusCode: status,
            message: body,
            path: request.url,
            timestamp: new Date().toISOString(),
          },
    );
  }

  /**
   * Body-parser/http-errors middleware errors (PayloadTooLargeError and
   * similar) aren't NestJS HttpExceptions, but they carry a genuine
   * client-error HTTP status (`status`/`statusCode`, 4xx) set by the
   * library that threw them. Only trusts a value already in the 4xx
   * range — never lets an arbitrary thrown object claim a 2xx/3xx/5xx
   * status through this path.
   */
  private middlewareStatus(exception: unknown): number | null {
    if (typeof exception !== 'object' || exception === null) return null;
    const candidate =
      (exception as { status?: unknown; statusCode?: unknown }).status ??
      (exception as { status?: unknown; statusCode?: unknown }).statusCode;
    return typeof candidate === 'number' && candidate >= 400 && candidate < 500 ? candidate : null;
  }

  private messageOf(exception: unknown): string {
    return exception instanceof Error && exception.message ? exception.message : 'Bad Request';
  }
}
