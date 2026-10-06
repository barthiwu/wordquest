import { decideResult, isReadyToSettle, settlementDeadline, VersusSide } from './versus.util';

const side = (over: Partial<VersusSide> = {}): VersusSide => ({
  correct: 0,
  answered: 0,
  timeMs: 0,
  finished: false,
  finishedAt: null,
  ...over,
});
const done = (correct: number, timeMs: number, at = new Date('2026-10-06T12:00:00Z')) =>
  side({ correct, answered: 5, timeMs, finished: true, finishedAt: at });

describe('decideResult', () => {
  it('more correct wins when both finished', () => {
    expect(decideResult(done(4, 90000), done(3, 20000))).toEqual({ winner: 'HOST', reason: 'WIN' });
    expect(decideResult(done(2, 10000), done(3, 90000))).toEqual({
      winner: 'GUEST',
      reason: 'WIN',
    });
  });

  it('breaks an equal score on total time', () => {
    expect(decideResult(done(3, 40000), done(3, 50000))).toEqual({ winner: 'HOST', reason: 'WIN' });
    expect(decideResult(done(3, 60000), done(3, 50000))).toEqual({
      winner: 'GUEST',
      reason: 'WIN',
    });
  });

  it('is a draw only when score and time are identical', () => {
    expect(decideResult(done(3, 50000), done(3, 50000))).toEqual({ winner: null, reason: 'DRAW' });
  });

  it('forfeit: compares partial scores when one player did not finish', () => {
    const quit = side({ correct: 4, answered: 4, timeMs: 30000 });
    expect(decideResult(done(3, 50000), quit)).toEqual({ winner: 'GUEST', reason: 'FORFEIT' });
    expect(decideResult(done(5, 50000), quit)).toEqual({ winner: 'HOST', reason: 'FORFEIT' });
  });

  it('forfeit: the finisher wins an equal score', () => {
    const quit = side({ correct: 3, answered: 4, timeMs: 1000 });
    expect(decideResult(quit, done(3, 90000))).toEqual({ winner: 'GUEST', reason: 'FORFEIT' });
  });

  it('a player who never started loses to anyone who answered', () => {
    expect(decideResult(done(0, 40000), side())).toEqual({ winner: 'HOST', reason: 'FORFEIT' });
  });

  it('nobody answered: no contest', () => {
    expect(decideResult(side(), side())).toEqual({ winner: null, reason: 'NO_CONTEST' });
  });
});

describe('settlement timing', () => {
  const t0 = new Date('2026-10-06T12:00:00Z');
  const grace = 6 * 60_000;
  const expires = new Date(t0.getTime() + 25 * 60_000);

  it('uses the match deadline when nobody has finished', () => {
    expect(settlementDeadline(expires, [side(), side()], grace)).toEqual(expires);
  });

  it('shortens to first finish + grace', () => {
    const d = settlementDeadline(expires, [done(3, 1, t0), side()], grace);
    expect(d).toEqual(new Date(t0.getTime() + grace));
  });

  it('never exceeds the match deadline', () => {
    const late = new Date(t0.getTime() + 24 * 60_000);
    expect(settlementDeadline(expires, [done(3, 1, late), side()], grace)).toEqual(expires);
  });

  it('is ready immediately when both finished, otherwise only at the deadline', () => {
    const a = done(3, 1, t0);
    const b = done(2, 1, t0);
    expect(isReadyToSettle(expires, a, b, grace, t0)).toBe(true);
    const slow = side({ answered: 2, correct: 1 });
    expect(isReadyToSettle(expires, a, slow, grace, new Date(t0.getTime() + grace - 1))).toBe(
      false,
    );
    expect(isReadyToSettle(expires, a, slow, grace, new Date(t0.getTime() + grace))).toBe(true);
  });
});
