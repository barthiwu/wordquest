import { pdfSafe, renderResultPdf } from './group-results.pdf';
import { buildResultSheet, SheetMemberInput } from './group-results.util';

const words = Array.from({ length: 20 }, (_, index) => ({
  index,
  word: `word${index + 1}`,
  definition: 'a definition',
}));

function member(i: number, name: string, answered = 20): SheetMemberInput {
  return {
    userId: `u${i}`,
    name,
    isHost: false,
    session: {
      completed: answered === 20,
      answers: Array.from({ length: answered }, (_, w) => ({
        wordIndex: w,
        submittedAnswer: w % 3 === 0 ? `wrng${w}` : `word${w + 1}`,
        isCorrect: w % 3 !== 0,
        timedOut: false,
        responseTimeMs: 3_000 + w * 100,
      })),
    },
  };
}

const sheetOf = (members: SheetMemberInput[], game = 'COMPLETE_IT') =>
  buildResultSheet({
    groupId: 'g1',
    title: 'JSS2 vocabulary',
    game,
    ended: true,
    activatedAt: new Date('2026-10-12T09:00:00Z'),
    endedAt: new Date('2026-10-12T10:00:00Z'),
    now: new Date('2026-10-12T10:05:00Z'),
    words,
    members,
  });

const pageCount = (pdf: Buffer): number =>
  (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('pdfSafe', () => {
  it('keeps Latin text and replaces characters the built-in fonts cannot draw', () => {
    expect(pdfSafe('Chidi Okafor')).toBe('Chidi Okafor');
    expect(pdfSafe('José Ñandú')).toBe('José Ñandú');
    expect(pdfSafe('أحمد')).toBe('????');
    expect(pdfSafe('Ada 🎉')).toBe('Ada ?');
    expect(pdfSafe('a\u0000b\nc')).toBe('a b c');
    expect(pdfSafe(null)).toBe('');
  });
});

describe('renderResultPdf', () => {
  it('produces a real PDF', async () => {
    const pdf = await renderResultPdf(sheetOf([member(1, 'Ada'), member(2, 'Bayo', 5)]));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.subarray(-8).toString('latin1')).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it('paginates a full group of 50 players without throwing', async () => {
    const many = Array.from({ length: 50 }, (_, i) => member(i, `Player ${i + 1}`));
    const pdf = await renderResultPdf(sheetOf(many));
    expect(pageCount(pdf)).toBeGreaterThan(5);
  });

  it('copes with hostile, very long and non-Latin names', async () => {
    const pdf = await renderResultPdf(
      sheetOf([member(1, 'x'.repeat(400)), member(2, 'أحمد 🎉 (Ahmed)'), member(3, '=cmd()')]),
    );
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders players who did not start, and an empty group', async () => {
    const idle: SheetMemberInput = { userId: 'i', name: 'Idle', isHost: false, session: null };
    expect((await renderResultPdf(sheetOf([idle]))).length).toBeGreaterThan(1000);
    expect((await renderResultPdf(sheetOf([]))).length).toBeGreaterThan(1000);
  });

  it('renders a Hangman sheet', async () => {
    const pdf = await renderResultPdf(sheetOf([member(1, 'Ada')], 'HANGMAN'));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
