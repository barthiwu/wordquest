import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { importWordsFromCsv } from './lib/csv-word-import';

const prisma = new PrismaClient();

/**
 * Seeds the original WordQuest clans (§19). Names/lore are original —
 * inspired by the *idea* of banners/factions, not any specific IP.
 */
const CLANS = [
  {
    name: 'Ashfall Wardens',
    description: 'Disciplined scholars of the scorched eastern plains.',
    lore: 'Once keepers of a great burned library, the Wardens now carry its lost words forward, one player at a time.',
    bannerAsset: 'clans/ashfall-wardens/banner.png',
  },
  {
    name: 'Tidebound Circle',
    description: 'Wandering linguists who trade in words the way sailors trade in stories.',
    lore: 'The Circle believes every language is a tide — it goes out, but it always comes back changed.',
    bannerAsset: 'clans/tidebound-circle/banner.png',
  },
  {
    name: 'Emberlight Choir',
    description: 'Performers and orators who treat vocabulary as a kind of song.',
    lore: 'The Choir holds that a word spoken with true understanding burns brighter than any spell.',
    bannerAsset: 'clans/emberlight-choir/banner.png',
  },
  {
    name: 'Greywood Cartographers',
    description: 'Methodical mapmakers who chart meaning the way others chart terrain.',
    lore: 'Every mastered word is a pin on the Cartographers\u2019 endless map of the mind.',
    bannerAsset: 'clans/greywood-cartographers/banner.png',
  },
];

/**
 * The full shipped vocabulary (Vocabulary Vault spec §2/§12: minimum
 * 7-letter words) — a single production CSV, imported through the same
 * validated pipeline a content editor's future CSV would go through
 * (prisma/lib/csv-word-import.ts).
 *
 * As of the V21 Vocabulary Vault Final Production Pass,
 * prisma/vocabulary-production.csv is the one authoritative word list.
 * It shipped as 2000 words (IDs 1-2000, no gaps or duplicates) and was
 * expanded to 10,000 (IDs 1-10000, still no gaps or duplicates — the
 * added 8001-10000 range is WordNet-sourced, upserted by word so
 * re-running the seed never creates a duplicate row for the original
 * 2000), in the Vocabulary Vault V2 header shape (ID, Word, Definition,
 * Part of Speech, Example Sentence, Synonym 1, Synonym 2, CEFR Level,
 * Difficulty Score, Category, Frequency Level, Word Family, Usage
 * Note, Related Words). It supersedes the five files this used to be
 * split across (words-template.csv, words-51-500.csv, and
 * vocabulary-vault-v2-batch1/2/3.csv — all deleted; see
 * prisma/README.md for the merge history).
 *
 * Every word carries cefrLevel, category, difficultyScore,
 * frequencyLevel, and at least one synonym (Synonym 1 is now a
 * hard-required column — see src/content/word-import.ts) — a fresh
 * `npx prisma db seed` against an empty database gets the same
 * fully-enriched vocabulary the live DB already has, instead of
 * regressing Adaptive AI word selection with NULL metadata.
 *
 * Related Words column (added 2026-09-24): populates Word.relatedWords,
 * which QuestsService.requestHint() reads from -- before this the
 * column didn't exist in any shipped CSV, so every word's relatedWords
 * came back empty and "Hint" was silently non-functional for the whole
 * 10,000-word list. Generated programmatically from WordNet (hypernyms,
 * coordinate/sibling terms, meronyms, entailments, and
 * derivational/pertainym relations depending on part of speech),
 * filtered to exclude the word's own synonyms/word-family forms and
 * WordNet-recorded antonyms, and preferring candidates that are
 * themselves already in this vocabulary list. ~96% coverage; the
 * remainder is mostly closed-class words (discourse adverbs like
 * "anymore"/"besides", participial adjectives like "accepting") that
 * don't have a meaningful "related word" in the first place -- Hint
 * stays gracefully unavailable for those, same as before. Automated,
 * not hand-edited -- a manual editorial pass would still improve on it.
 *
 * 2026-09-30 content-quality pass (Barth, after alpha-test feedback):
 * an audit found the V21 batch had two mechanical WordNet-generation
 * bugs -- 43% of words shared their exact definition text with at
 * least one other word (up to 13 words reading identically), and 48%
 * of example sentences didn't contain the headword at all (pulled from
 * a different lemma in the same synset). Fixing this for the whole
 * 10,000-word list is an ongoing hand-authored rewrite, tracked outside
 * this repo. The same pass also introduced MAX_WORD_LENGTH (see
 * src/content/word-import.ts): 56 words over the new 15-letter ceiling
 * (the longest was "Methylenedioxymethamphetamine", 29 letters -- not
 * a reasonable ask for a guessing game) were replaced in-place, same
 * CSV ID, with shorter words skewed toward the 7-10 letter range. A
 * live database already carrying the old long words needs
 * scripts/deactivate-long-words.ts run once against it -- this seed
 * alone does not remove/deactivate rows for words no longer in the CSV.
 */
const WORD_CSV_FILES = ['vocabulary-production.csv'];

async function seedWords() {
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const file of WORD_CSV_FILES) {
    const { created, updated, errors } = await importWordsFromCsv(prisma, join(__dirname, file));
    totalCreated += created;
    totalUpdated += updated;
    totalErrors += errors.length;
    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`${file}: ${errors.length} row(s) skipped:`);
      for (const err of errors) {
        // eslint-disable-next-line no-console
        console.log(`  line ${err.line}: ${err.reason}`);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded words from ${WORD_CSV_FILES.length} file(s): ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} skipped.`,
  );
}

const TIMED_QUESTS = [
  {
    key: 'morning-quest',
    title: 'Morning Quest',
    description: 'One word to start the day.',
    windowStartHour: 0,
    windowEndHour: 11,
  },
  {
    key: 'noon-quest',
    title: 'Noon Quest',
    description: 'One word for the middle of the day.',
    windowStartHour: 12,
    windowEndHour: 15,
  },
  {
    key: 'evening-quest',
    title: 'Evening Quest',
    description: 'One word to close out the day.',
    windowStartHour: 16,
    windowEndHour: 23,
  },
] as const;

async function seedQuests() {
  for (const q of TIMED_QUESTS) {
    await prisma.quest.upsert({
      where: { key: q.key },
      update: {},
      create: {
        key: q.key,
        title: q.title,
        description: q.description,
        type: 'DAILY',
        wordCount: 1,
        baseXp: 50,
        baseGlyphs: 10,
        windowStartHour: q.windowStartHour,
        windowEndHour: q.windowEndHour,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${TIMED_QUESTS.length} timed quests.`);
}

async function main() {
  for (const clan of CLANS) {
    await prisma.clan.upsert({
      where: { name: clan.name },
      update: {},
      create: clan,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${CLANS.length} clans.`);

  await seedWords();
  await seedQuests();
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
