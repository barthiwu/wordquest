// One-off content-curation script (2026-09-30, Barth: "let's cap our
// vocabulary words to a max of 15 letters... prune off anything beyond
// 15"). backend/prisma/vocabulary-production.csv no longer contains
// these 56 words (they were replaced in-place, same CSV ID, with new
// 7-10-letter-skewed words) -- but importWordsFromCsv only ever
// upserts what IS in a CSV; it never deactivates a word that used to
// be there and now isn't (see prisma/lib/csv-word-import.ts). So the
// old long rows (e.g. "Methylenedioxymethamphetamine", 29 letters)
// would keep sitting in the DB with isActive=true, still eligible for
// Daily Quest, until something explicitly turns them off. This is
// that something.
//
// Deactivates rather than deletes: a word already backing a player's
// Mastery/QuestAttempt/AliMessage history must stay referenceable (FK
// constraints, and their history shouldn't vanish) -- isActive=false
// just stops WordsService.fetchActivePool from picking it again.
//
// Usage (run from backend/, once against each environment you've
// imported the old CSV into -- local dev, and Railway production):
//
//   npx ts-node scripts/deactivate-long-words.ts            # local dev DATABASE_URL from .env
//   DATABASE_URL="<railway public connection string>" \
//     npx ts-node scripts/deactivate-long-words.ts          # Railway
//
// Safe to re-run -- words already inactive (or never imported into
// this environment at all) are just reported and skipped.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The exact 56 words vocabulary-production.csv used to contain before
// the 2026-09-30 15-letter cap (all were 16-29 letters). Matched
// case-insensitively via normalizedWord, same as the CSV importer
// itself.
const PRUNED_WORDS = [
  'Methylenedioxymethamphetamine',
  'Auriculoventricular',
  'Contemporaneousness',
  'Chlorofluorocarbon',
  'Interconnectedness',
  'Tetraiodothyronine',
  'Cardiorespiratory',
  'Commercialisation',
  'Compartmentalised',
  'Compartmentalized',
  'Comprehensiveness',
  'Condescendingness',
  'Constitutionalise',
  'Desynchronisation',
  'Hypophysectomized',
  'Imperturbableness',
  'Indistinguishable',
  'Institutionalised',
  'Institutionalized',
  'Interrelationship',
  'Misinterpretation',
  'Straightforwardly',
  'Supernaturalistic',
  'Undistinguishable',
  'Misunderstanding',
  'Entrepreneurship',
  'Affectionateness',
  'Autobiographical',
  'Characterisation',
  'Characterization',
  'Circumstantially',
  'Conversationally',
  'Counterterrorist',
  'Diagrammatically',
  'Faintheartedness',
  'Gastrointestinal',
  'Geomorphological',
  'Imperishableness',
  'Imperturbability',
  'Incomprehensible',
  'Incontrovertible',
  'Internationalism',
  'Internationality',
  'Irrepressibility',
  'Knowledgeability',
  'Meretriciousness',
  'Nonproliferation',
  'Nonvolatilisable',
  'Phantasmagorical',
  'Psychoanalytical',
  'Sensationalistic',
  'Transubstantiate',
  'Uncomprehensible',
  'Unpredictability',
  'Unresponsiveness',
  'Ununderstandably',
];

async function main() {
  if (PRUNED_WORDS.length !== 56) {
    throw new Error(`Expected 56 words, list has ${PRUNED_WORDS.length} -- check for edits.`);
  }

  let deactivated = 0;
  let alreadyInactive = 0;
  let notFound = 0;
  const stillReferenced: string[] = [];

  for (const word of PRUNED_WORDS) {
    const existing = await prisma.word.findFirst({
      where: { normalizedWord: word.toLowerCase() },
      select: { id: true, word: true, isActive: true, length: true },
    });

    if (!existing) {
      notFound++;
      continue;
    }
    if (!existing.isActive) {
      alreadyInactive++;
      continue;
    }

    await prisma.word.update({ where: { id: existing.id }, data: { isActive: false } });
    deactivated++;

    // Informational only -- Mastery/QuestAttempt rows referencing this
    // word are fine (FK, not deleted), just worth knowing about.
    const masteryCount = await prisma.mastery.count({ where: { wordId: existing.id } });
    if (masteryCount > 0) {
      stillReferenced.push(`${existing.word} (${masteryCount} player(s) have Mastery data on it)`);
    }
  }

  console.log(
    `Deactivated ${deactivated}, already inactive ${alreadyInactive}, not found in this DB ${notFound} (out of ${PRUNED_WORDS.length}).`,
  );
  if (stillReferenced.length > 0) {
    console.log(
      "\nThese deactivated words already have player Mastery data -- that history is untouched, the word just won't be served again:",
    );
    for (const line of stillReferenced) console.log('  -', line);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
