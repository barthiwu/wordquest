// One-off admin utility (2026-09-29): Barth's Xcode/simulator mobile
// builds have always pointed at the LOCAL dev backend
// (mobile/.env EXPO_PUBLIC_API_URL -> localhost/LAN, backend/.env
// DATABASE_URL -> local Postgres on his Mac), which is a completely
// separate database from Railway's production Postgres that
// production/web builds and the new Analytics Dashboard read from.
// His "main" account -- the one with real level/XP/mastery/streak
// history -- only exists in the local database. This script copies
// that account's core progress into Railway so the same email logs
// into an account with that history there too, and (separately) so
// he can be promoted to ADMIN on Railway and see it in the dashboard.
//
// Deliberately NOT migrated (each is either per-environment-generated
// content with no stable cross-environment ID, a security/session
// artifact that should never be copied, or secondary history that
// doesn't define "the account" the way progress/mastery does):
//   - RefreshToken / EmailVerificationToken / PasswordResetToken /
//     PushToken / SecurityEvent / IdempotencyKey (session/security —
//     regenerate on the target, never copy)
//   - QuestAttempt / ChallengeAttempt / WordInTheWildMission(+Submission) /
//     BossBattle* / OrderSelection / ArcadeGameSession / WordDuelPlayerState
//     (per-session history tied to Quest/BossBattle rows that are
//     generated independently per environment, no stable ID to map to)
//   - ShopPurchase (ShopItem catalog IDs also differ per environment;
//     if this matters, re-purchase on the target with the migrated
//     glyph balance)
//   - Notification / AliMessage / AnalyticsEvent / Feedback / Report /
//     Friendship / Block (device/session noise, moderation history, or
//     social graph that's meaningless without the other side existing
//     on the target too)
//
// Migrated: User (progress-defining fields), UserProgression,
// LearningProfile, NotificationPreference, XpTransaction,
// GlyphTransaction, Mastery (Word looked up by exact word text on the
// target, since Word ids are independently generated per environment),
// AchievementUnlock (achievementId is a static catalog key, not a
// per-environment id -- see prisma/schema.prisma's comment above
// AchievementUnlock), QuestCard, CefrAssessment,
// DailyMasterChallenge, and Clan membership (looked up by clan name).
//
// Refuses to run if an account with this email already exists on the
// target (never overwrites). The account's original id is preserved
// so nothing needs remapping later. Everything is written in one
// target-side transaction: it either all lands or none of it does.
//
// Usage (run from backend/, on your own machine -- NOT from a remote
// shell, since it needs to reach your local Postgres directly):
//
//   SOURCE_DATABASE_URL="postgresql://wordquest:wordquest@localhost:5432/wordquest?schema=public" \
//   TARGET_DATABASE_URL="<railway public connection string>" \
//     npx ts-node scripts/migrate-local-account-to-railway.ts --email you@example.com
import { PrismaClient, Prisma } from '@prisma/client';

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main() {
  const email = readArg('--email')?.toLowerCase().trim();
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (!email || !sourceUrl || !targetUrl) {
    console.error(
      'Usage: SOURCE_DATABASE_URL=<local> TARGET_DATABASE_URL=<railway> ' +
        'npx ts-node scripts/migrate-local-account-to-railway.ts --email <email>',
    );
    process.exit(1);
  }

  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

  try {
    const alreadyOnTarget = await target.user.findUnique({ where: { email } });
    if (alreadyOnTarget) {
      console.error(
        `An account with ${email} already exists on the TARGET database (id ${alreadyOnTarget.id}). ` +
          'Refusing to run -- nothing was changed. Delete or rename it first if you really want to re-migrate.',
      );
      process.exit(1);
    }

    const user = await source.user.findUnique({
      where: { email },
      include: {
        progression: true,
        learningProfile: true,
        notificationPreference: true,
        xpTransactions: true,
        glyphTransactions: true,
        masteries: true,
        achievementUnlocks: true,
        questCards: true,
        cefrAssessments: true,
        dailyMasterChallenges: true,
        clan: true,
      },
    });

    if (!user) {
      console.error(
        `No account found for ${email} on the SOURCE (local) database. Nothing to migrate.`,
      );
      process.exit(1);
    }

    console.log(`Found local account ${user.email} (id ${user.id}, username ${user.username}).`);
    console.log(
      `  progression: ${user.progression ? `level ${user.progression.level}, ${user.progression.totalXp} XP, streak ${user.progression.currentStreak}` : 'none'}`,
    );
    console.log(
      `  masteries: ${user.masteries.length}, achievements: ${user.achievementUnlocks.length}, quest cards: ${user.questCards.length}`,
    );

    // Username uniqueness on target -- fall back to a suffixed handle
    // rather than failing outright; he can rename it in Settings after.
    let username = user.username;
    const usernameTaken = await target.user.findUnique({ where: { username } });
    if (usernameTaken) {
      username = `${user.username}_migrated`;
      console.warn(
        `Username "${user.username}" is taken on target -- using "${username}" instead.`,
      );
    }

    // Clan: map by name; leave unset if the target has no matching clan.
    let targetClanId: string | null = null;
    if (user.clan) {
      const targetClan = await target.clan.findUnique({ where: { name: user.clan.name } });
      if (targetClan) {
        targetClanId = targetClan.id;
      } else {
        console.warn(`Clan "${user.clan.name}" not found on target -- leaving clan unset.`);
      }
    }

    // Mastery -> Word: map by exact word text (Word ids differ per environment).
    const wordIds = [...new Set(user.masteries.map((m) => m.wordId))];
    const sourceWords = wordIds.length
      ? await source.word.findMany({
          where: { id: { in: wordIds } },
          select: { id: true, word: true },
        })
      : [];
    const wordTextBySourceId = new Map(sourceWords.map((w) => [w.id, w.word]));
    const neededTexts = [...new Set(sourceWords.map((w) => w.word))];
    const targetWords = neededTexts.length
      ? await target.word.findMany({
          where: { word: { in: neededTexts } },
          select: { id: true, word: true },
        })
      : [];
    const targetWordIdByText = new Map(targetWords.map((w) => [w.word, w.id]));

    let skippedMasteries = 0;

    // Everything below is built as plain arrays first and written with
    // createMany (one INSERT per table instead of one round trip per
    // row) -- a per-row create() loop over a network-proxied connection
    // (Railway's TCP proxy adds real latency per query) can easily blow
    // past an interactive transaction's timeout once there are a few
    // hundred XP/glyph ledger rows, which surfaces as a confusing
    // "Transaction not found" error from Prisma rather than a plain
    // timeout message.
    const xpTransactionsData = user.xpTransactions.map((xt) => {
      const { id: _id, userId: _u, ...rest } = xt;
      return { ...rest, userId: user.id };
    });
    const glyphTransactionsData = user.glyphTransactions.map((gt) => {
      const { id: _id, userId: _u, ...rest } = gt;
      return { ...rest, userId: user.id };
    });
    const masteriesData = user.masteries.flatMap((m) => {
      const text = wordTextBySourceId.get(m.wordId);
      const targetWordId = text ? targetWordIdByText.get(text) : undefined;
      if (!targetWordId) {
        skippedMasteries++;
        return [];
      }
      const { id: _id, userId: _u, wordId: _w, ...rest } = m;
      return [{ ...rest, userId: user.id, wordId: targetWordId }];
    });
    const achievementUnlocksData = user.achievementUnlocks.map((au) => {
      const { id: _id, userId: _u, ...rest } = au;
      return { ...rest, userId: user.id };
    });
    const questCardsData = user.questCards.map((qc) => {
      const { id: _id, userId: _u, ...rest } = qc;
      return { ...rest, userId: user.id };
    });
    const cefrAssessmentsData = user.cefrAssessments.map((ca) => {
      const { id: _id, userId: _u, ...rest } = ca;
      return { ...rest, userId: user.id, dimensions: rest.dimensions ?? Prisma.JsonNull };
    });
    const dailyMasterChallengesData = user.dailyMasterChallenges.map((dmc) => {
      const { id: _id, userId: _u, ...rest } = dmc;
      return { ...rest, userId: user.id, scores: rest.scores ?? Prisma.JsonNull };
    });

    await target.$transaction(
      async (tx) => {
        await tx.user.create({
          data: {
            id: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            displayName: user.displayName,
            username,
            countryCode: user.countryCode,
            dateOfBirth: user.dateOfBirth,
            avatarKey: user.avatarKey,
            role: user.role,
            timezone: user.timezone,
            nativeLanguage: user.nativeLanguage,
            targetLanguage: user.targetLanguage,
            learningGoal: user.learningGoal,
            onboardingCompletedAt: user.onboardingCompletedAt,
            englishVariant: user.englishVariant,
            emailVerifiedAt: user.emailVerifiedAt,
            status: user.status,
            createdAt: user.createdAt,
            clanId: targetClanId,
          },
        });

        if (user.progression) {
          const { userId: _u, ...rest } = user.progression;
          await tx.userProgression.create({ data: { ...rest, userId: user.id } });
        }
        if (user.learningProfile) {
          const { userId: _u, ...rest } = user.learningProfile;
          await tx.learningProfile.create({ data: { ...rest, userId: user.id } });
        }
        if (user.notificationPreference) {
          const { userId: _u, ...rest } = user.notificationPreference;
          await tx.notificationPreference.create({ data: { ...rest, userId: user.id } });
        }

        if (xpTransactionsData.length)
          await tx.xpTransaction.createMany({ data: xpTransactionsData });
        if (glyphTransactionsData.length)
          await tx.glyphTransaction.createMany({ data: glyphTransactionsData });
        if (masteriesData.length) await tx.mastery.createMany({ data: masteriesData });
        if (achievementUnlocksData.length)
          await tx.achievementUnlock.createMany({ data: achievementUnlocksData });
        if (questCardsData.length) await tx.questCard.createMany({ data: questCardsData });
        if (cefrAssessmentsData.length)
          await tx.cefrAssessment.createMany({ data: cefrAssessmentsData });
        if (dailyMasterChallengesData.length)
          await tx.dailyMasterChallenge.createMany({ data: dailyMasterChallengesData });
      },
      // Generous timeout -- createMany batches make this fast in
      // practice, but a slow proxied connection to Railway shouldn't
      // abort a migration that's otherwise working.
      { timeout: 120_000, maxWait: 15_000 },
    );

    console.log(
      `\nDone. Migrated account ${user.email} (id ${user.id}, username ${username}) to the target database.`,
    );
    console.log(
      `  ${user.xpTransactions.length} XP transactions, ${user.glyphTransactions.length} glyph transactions, ` +
        `${user.masteries.length - skippedMasteries}/${user.masteries.length} masteries, ` +
        `${user.achievementUnlocks.length} achievements, ${user.questCards.length} quest cards, ` +
        `${user.cefrAssessments.length} CEFR assessments, ${user.dailyMasterChallenges.length} master challenges.`,
    );
    if (skippedMasteries > 0) {
      console.warn(
        `  ${skippedMasteries} masteries were skipped -- their word wasn't found on the target by exact text match ` +
          '(likely a vocabulary seeding difference between environments).',
      );
    }
    console.log(
      '\nYour local password still works on the target (the password hash was copied as-is). ' +
        'Your local account is untouched -- this only copied data, it did not delete anything.',
    );
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
