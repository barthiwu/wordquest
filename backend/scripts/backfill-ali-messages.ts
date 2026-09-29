// One-off admin utility (2026-09-29): AliMessage was deliberately left
// out of migrate-local-account-to-railway.ts's first pass (filed under
// "device/session noise" at the time) -- turned out to be wrong once
// Barth actually looked at the migrated account: ALI's accumulated
// reaction history is part of what makes the companion feel like it
// knows you, not session noise, and its absence is what an empty "ALI
// is still getting to know you" screen on an otherwise-level-8 account
// reveals.
//
// Safe to run against an account the main migration script already
// created: unlike that script, this one does NOT refuse if the user
// already exists on the target (it's expected to) -- it looks the
// account up by email on BOTH sides, copies AliMessage rows with
// their original id preserved (skipDuplicates: true makes re-running
// harmless), and touches nothing else.
//
// Usage (run from backend/, on your own machine so it can reach your
// local Postgres directly):
//
//   SOURCE_DATABASE_URL="postgresql://wordquest:wordquest@localhost:5432/wordquest?schema=public" \
//   TARGET_DATABASE_URL="<railway public connection string>" \
//     npx ts-node scripts/backfill-ali-messages.ts --email you@example.com
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
        'npx ts-node scripts/backfill-ali-messages.ts --email <email>',
    );
    process.exit(1);
  }

  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

  try {
    const [sourceUser, targetUser] = await Promise.all([
      source.user.findUnique({ where: { email }, select: { id: true } }),
      target.user.findUnique({ where: { email }, select: { id: true } }),
    ]);

    if (!sourceUser) {
      console.error(`No account found for ${email} on the SOURCE (local) database.`);
      process.exit(1);
    }
    if (!targetUser) {
      console.error(
        `No account found for ${email} on the TARGET database yet -- run ` +
          'migrate-local-account-to-railway.ts first.',
      );
      process.exit(1);
    }
    if (targetUser.id !== sourceUser.id) {
      // Shouldn't happen if this account came through the main migration
      // script (which preserves the source id), but this script only
      // works when both ids match -- AliMessage.userId is a plain string
      // column, copied as-is, not remapped.
      console.error(
        `Account id mismatch: source ${sourceUser.id} vs target ${targetUser.id}. ` +
          'This script only handles an account migrated with the same id preserved.',
      );
      process.exit(1);
    }

    const messages = await source.aliMessage.findMany({ where: { userId: sourceUser.id } });
    console.log(`Found ${messages.length} ALI message(s) locally for ${email}.`);

    if (messages.length === 0) {
      console.log('Nothing to copy.');
      return;
    }

    const result = await target.aliMessage.createMany({
      data: messages.map((m) => ({ ...m, eventContext: m.eventContext ?? Prisma.JsonNull })),
      skipDuplicates: true,
    });

    console.log(
      `Copied ${result.count} ALI message(s) to the target ` +
        `(${messages.length - result.count} already present, skipped).`,
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
