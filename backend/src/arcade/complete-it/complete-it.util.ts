/**
 * Blanks the target word out of its own example sentence for Complete
 * It's "fill in the missing word" presentation — the sentence-
 * completion sibling of ScrambleQuest's letter-unscrambling and Daily
 * Quest's letter-blanking (same word pool, same reward formula, a
 * different way of hiding the answer). Word.exampleSentence is always
 * authored to contain the word itself (schema.prisma: "the primary
 * sentence — always present"), so a case-insensitive whole-word match
 * is expected to succeed; `found` lets a caller detect the rare bad-
 * data case (a sentence that doesn't actually contain its own word)
 * instead of silently shipping the whole answer, unblanked, to the
 * player. CompleteItService filters every session's word pool down to
 * `found === true` words at session-start time (see start()) so
 * buildChallengeView never has to handle the false case mid-session.
 */
export interface BlankedSentence {
  sentenceWithBlank: string;
  found: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The blank is sized to the word's own length (e.g. a 7-letter word
 * blanks to "_______") — the same "length is never truly hidden"
 * convention ScrambleQuest (wordLength) and Daily Quest (missingIndexes/
 * displayPattern) already use elsewhere in the app. */
export function blankSentence(sentence: string, word: string): BlankedSentence {
  const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
  if (!pattern.test(sentence)) {
    return { sentenceWithBlank: sentence, found: false };
  }
  const blank = '_'.repeat(word.length);
  return { sentenceWithBlank: sentence.replace(pattern, blank), found: true };
}
