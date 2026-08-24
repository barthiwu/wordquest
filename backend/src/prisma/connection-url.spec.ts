import { withConnectionLimitFloor } from './connection-url';

describe('withConnectionLimitFloor', () => {
  it('adds the default floor when connection_limit is entirely absent', () => {
    const result = withConnectionLimitFloor('postgresql://user:pass@host:5432/db');
    expect(new URL(result).searchParams.get('connection_limit')).toBe('10');
  });

  it('respects an operator-provided connection_limit, even one lower than the floor', () => {
    const result = withConnectionLimitFloor(
      'postgresql://user:pass@host:5432/db?connection_limit=3',
    );
    expect(new URL(result).searchParams.get('connection_limit')).toBe('3');
  });

  it('respects an operator-provided connection_limit higher than the floor', () => {
    const result = withConnectionLimitFloor(
      'postgresql://user:pass@host:5432/db?connection_limit=50',
    );
    expect(new URL(result).searchParams.get('connection_limit')).toBe('50');
  });

  it('preserves other existing query parameters', () => {
    const result = withConnectionLimitFloor(
      'postgresql://user:pass@host:5432/db?schema=public&sslmode=require',
    );
    const url = new URL(result);
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('connection_limit')).toBe('10');
  });

  it('honors a custom minimum when one is passed', () => {
    const result = withConnectionLimitFloor('postgresql://user:pass@host:5432/db', 25);
    expect(new URL(result).searchParams.get('connection_limit')).toBe('25');
  });

  it('treats a non-numeric connection_limit as unset and applies the floor', () => {
    const result = withConnectionLimitFloor(
      'postgresql://user:pass@host:5432/db?connection_limit=notanumber',
    );
    expect(new URL(result).searchParams.get('connection_limit')).toBe('10');
  });

  it('returns a malformed URL untouched rather than throwing', () => {
    const malformed = 'not-a-valid-url';
    expect(withConnectionLimitFloor(malformed)).toBe(malformed);
  });
});
