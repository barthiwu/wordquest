import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { MonitoringService } from '../monitoring.service';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  const monitoringMock = { captureException: jest.fn() };

  const jsonMock = jest.fn();
  const statusMock = jest.fn(() => ({ json: jsonMock }));
  const response = { status: statusMock };
  const request = { method: 'POST', url: '/api/v1/quests/complete' };

  function hostFor(): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter(monitoringMock as unknown as MonitoringService);
  });

  it('does not report a normal 4xx HttpException (expected, not a bug)', () => {
    filter.catch(new BadRequestException('bad input'), hostFor());
    expect(monitoringMock.captureException).not.toHaveBeenCalled();
  });

  it('does not report a NotFoundException', () => {
    filter.catch(new NotFoundException('missing'), hostFor());
    expect(monitoringMock.captureException).not.toHaveBeenCalled();
  });

  it('responds with the HttpException status and its own body, plus path/timestamp', () => {
    filter.catch(new BadRequestException('bad input'), hostFor());

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'bad input',
        path: '/api/v1/quests/complete',
        timestamp: expect.any(String),
      }),
    );
  });

  it('reports and responds 500 for a genuinely unhandled (non-HttpException) error', () => {
    const error = new Error('database connection lost');
    filter.catch(error, hostFor());

    expect(monitoringMock.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ method: 'POST', path: '/api/v1/quests/complete' }),
    );
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
  });

  it('never leaks the raw error message for an unhandled exception (no internal detail exposed to the client)', () => {
    filter.catch(new Error('sensitive stack detail'), hostFor());
    const body = jsonMock.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('sensitive stack detail');
  });

  // V22 §15 crash-testing finding: an oversized request body is rejected
  // by body-parser middleware BEFORE Nest's HttpException layer even
  // sees it — PayloadTooLargeError (from the `http-errors` package) has
  // a `status`/`statusCode` of 413 but is not `instanceof HttpException`.
  it('responds 413 (not 500) for a PayloadTooLargeError-shaped middleware error, and does not report it', () => {
    const error = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
    });
    filter.catch(error, hostFor());

    expect(statusMock).toHaveBeenCalledWith(413);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 413, message: 'request entity too large' }),
    );
    expect(monitoringMock.captureException).not.toHaveBeenCalled();
  });

  it('still falls through to 500 + reporting when a thrown object claims an out-of-range status (e.g. 200 or 599)', () => {
    filter.catch(Object.assign(new Error('weird'), { status: 200 }), hostFor());
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(monitoringMock.captureException).toHaveBeenCalled();
  });
});
