import { formatBossBattleCountdown } from './bossBattleCountdown';

describe('formatBossBattleCountdown', () => {
  it('shows "Live" with the real start time once status is LIVE', () => {
    const result = formatBossBattleCountdown(
      '2026-09-27T17:00:00.000Z',
      'LIVE',
      new Date('2026-09-27T17:10:00.000Z'),
    );
    expect(result).toEqual({ compact: 'Live', subtitle: 'Sun 5PM UTC' });
  });

  it('formats a multi-day wait in days', () => {
    const result = formatBossBattleCountdown(
      '2026-09-27T17:00:00.000Z',
      'SCHEDULED',
      new Date('2026-09-24T17:00:00.000Z'),
    );
    expect(result.compact).toBe('3d');
    expect(result.subtitle).toBe('Sun 5PM UTC');
  });

  it('formats an under-a-day wait in hours', () => {
    const result = formatBossBattleCountdown(
      '2026-09-27T17:00:00.000Z',
      'SCHEDULED',
      new Date('2026-09-27T10:00:00.000Z'),
    );
    expect(result.compact).toBe('7h');
  });

  it('formats an under-an-hour wait in minutes, never rounding down to 0m', () => {
    const result = formatBossBattleCountdown(
      '2026-09-27T17:00:00.000Z',
      'SCHEDULED',
      new Date('2026-09-27T16:59:30.000Z'),
    );
    expect(result.compact).toBe('1m');
  });
});
