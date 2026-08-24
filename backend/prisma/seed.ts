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
 * prisma/vocabulary-production.csv is the one authoritative word list:
 * 2000 words, IDs 1-2000 with no gaps or duplicates, in the Vocabulary
 * Vault V2 header shape (ID, Word, Definition, Part of Speech, Example
 * Sentence, Synonym 1, Synonym 2, CEFR Level, Difficulty Score,
 * Category, Frequency Level, Word Family, Usage Note). It supersedes
 * the five files this used to be split across (words-template.csv,
 * words-51-500.csv, and vocabulary-vault-v2-batch1/2/3.csv — all
 * deleted; see prisma/README.md for the merge history).
 *
 * Every one of the 2000 words carries cefrLevel, category,
 * difficultyScore, frequencyLevel, and at least one synonym (Synonym 1
 * is now a hard-required column — see src/content/word-import.ts) — a
 * fresh `npx prisma db seed` against an empty database gets the same
 * fully-enriched vocabulary the live DB already has, instead of
 * regressing Adaptive AI word selection with NULL metadata.
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
