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
  // Every occurrence is blanked ('g'): a sentence that repeats the word
  // used to keep the second one visible, giving the answer away.
  const source = `\\b${escapeRegExp(word)}\\b`;
  if (!new RegExp(source, 'i').test(sentence)) {
    return { sentenceWithBlank: sentence, found: false };
  }
  const blank = '_'.repeat(word.length);
  return { sentenceWithBlank: sentence.replace(new RegExp(source, 'gi'), blank), found: true };
}

/**
 * Minimum word count for a Complete It sentence to count as "fair to
 * fill in" (2026-09, Barth: "none of the sentences was easy to fill
 * up... the sentences themselves aren't an everyday use of english
 * sentence"). A whole-word match alone (blankSentence's `found`) isn't
 * enough of a quality bar on its own: an audit of vocabulary-
 * production.csv found that among rows where the sentence DOES contain
 * its own word, the median sentence is only 5 words long, because a
 * meaningful chunk of that corpus batch is WordNet-gloss-style terse
 * imperatives ("Tenderize meat.", "Deadlocked negotiations.") rather
 * than natural prose — exactly the "not an everyday use of English"
 * pattern reported. A 6-word floor filters those out while keeping the
 * large majority of the newer vocabulary-vault-3to6-letters.csv batch
 * (94%+ of its own found-word rows already clear 6 words).
 */
export const MIN_SENTENCE_WORDS = 6;

/**
 * The full Complete It content-quality gate: the sentence must contain
 * its own word (blankSentence's `found`) AND read like a real sentence
 * rather than a terse fragment (MIN_SENTENCE_WORDS). Used as
 * ArcadeChallengeService.pickChallenges's `filter` in
 * CompleteItService.start() so a session's word pool never includes a
 * word whose only corpus sentence would make the round unwinnable.
 */
export function isCompleteItSentenceUsable(sentence: string, word: string): boolean {
  if (!blankSentence(sentence, word).found) return false;
  return sentence.trim().split(/\s+/).filter(Boolean).length >= MIN_SENTENCE_WORDS;
}
