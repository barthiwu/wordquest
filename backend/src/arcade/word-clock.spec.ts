import { beginPendingWord } from './word-clock';

describe('beginPendingWord', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    currentIndex: 3,
    currentWordPending: true,
    currentWordStartedAt: new Date('2026-10-12T10:00:00Z'),
    ...over,
  });
  const prisma = () => ({
    arcadeGameSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
  });

  it('leaves a session that is not pending completely alone (no database call)', async () => {
    const db = prisma();
    const session = row({ currentWordPending: false });

    await expect(beginPendingWord(db as never, session)).resolves.toBe(session);
    expect(db.arcadeGameSession.updateMany).not.toHaveBeenCalled();
  });

  it('starts the clock now, once, guarded on the word and the pending flag', async () => {
    const db = prisma();
    const before = Date.now();

    const begun = await beginPendingWord(db as never, row());

    expect(db.arcadeGameSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', currentIndex: 3, currentWordPending: true },
      data: { currentWordPending: false, currentWordStartedAt: expect.any(Date) },
    });
    expect(begun.currentWordPending).toBe(false);
    expect(begun.currentWordStartedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("uses the other request's clock when a retry or double tap began the word first", async () => {
    const db = prisma();
    db.arcadeGameSession.updateMany.mockResolvedValue({ count: 0 });
    const theirs = row({
      currentWordPending: false,
      currentWordStartedAt: new Date('2026-10-12T10:05:00Z'),
    });
    db.arcadeGameSession.findUnique.mockResolvedValue(theirs);

    await expect(beginPendingWord(db as never, row())).resolves.toBe(theirs);
  });
});
