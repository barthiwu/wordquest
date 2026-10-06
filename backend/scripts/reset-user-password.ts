// One-off admin utility (2026-09-29): Barth got locked out of an account
// he registered on the live web build -- the standard self-service
// "forgot password" email flow can't help yet because no email provider
// is configured on Railway (see EmailService/EMAIL_API_KEY). This sets a
// new password directly, using the exact same bcrypt hashing
// (PASSWORD_SALT_ROUNDS=12) AuthService/UsersService use everywhere
// else, and also clears any failed-login lockout so a few bad guesses
// while troubleshooting don't compound the problem.
//
// Usage (run from backend/, against whichever DATABASE_URL is in the
// environment -- point it at Railway's production database, NOT the
// local dev one in .env, or this resets the wrong account):
//
//   DATABASE_URL="<railway public connection string>" NEW_PASSWORD="<new password>" \
//     npx ts-node scripts/reset-user-password.ts --email you@example.com
//   (or --username theirname; the lookup ignores upper/lower case)
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const PASSWORD_SALT_ROUNDS = 12; // must match users.service.ts

const prisma = new PrismaClient();

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

/** Host and database name only: never the credentials. */
function describeDatabase(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(DATABASE_URL missing or unreadable)';
  }
}

async function main() {
  const email = readArg('--email');
  const username = readArg('--username');
  // Prefer the NEW_PASSWORD environment variable: it keeps the password out
  // of the shell history and the process list.
  const password = process.env.NEW_PASSWORD ?? readArg('--password');

  if ((!email && !username) || !password) {
    console.error(
      'Usage: NEW_PASSWORD="<new password>" ts-node scripts/reset-user-password.ts (--email <email> | --username <username>)',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error(
      'Password must be at least 8 characters (matches RegisterDto/ResetPasswordDto validation).',
    );
    process.exit(1);
  }

  console.log(`Database: ${describeDatabase()}`);
  if (/localhost|127\.0\.0\.1|host\.docker\.internal/.test(describeDatabase())) {
    console.error(
      'This is a LOCAL database, not Railway. Set DATABASE_URL to the Railway public connection string and run again. Nothing changed.',
    );
    process.exit(1);
  }

  const select = {
    id: true,
    email: true,
    username: true,
    status: true,
    emailVerifiedAt: true,
    failedLoginAttempts: true,
    lockedUntil: true,
    createdAt: true,
    deletedAt: true,
  } as const;

  // Case-insensitive on purpose: older rows may not have been lower-cased.
  const user = email
    ? await prisma.user.findFirst({
        where: { email: { equals: email.trim(), mode: 'insensitive' } },
        select,
      })
    : await prisma.user.findFirst({
        where: { username: { equals: (username as string).trim(), mode: 'insensitive' } },
        select,
      });

  if (!user) {
    const needle = (email ?? username ?? '').split('@')[0].replace(/[0-9]+$/, '');
    const near = needle
      ? await prisma.user.findMany({
          where: {
            OR: [
              { email: { contains: needle, mode: 'insensitive' } },
              { username: { contains: needle, mode: 'insensitive' } },
            ],
          },
          select: { email: true, username: true, status: true, createdAt: true },
          take: 10,
        })
      : [];
    console.error(`No account found for ${email ?? username}. Nothing changed.`);
    if (near.length > 0) {
      console.error('Closest matches (check the spelling, or whether she signed up with another email):');
      for (const n of near) console.error(' ', n);
    } else {
      console.error('No similar emails or usernames either, so this is probably the wrong database.');
    }
    const total = await prisma.user.count();
    console.error(`(${total} accounts in this database.)`);
    process.exit(1);
  }

  console.log('Found account:', {
    id: user.id,
    email: user.email,
    username: user.username,
    status: user.status,
    deletedAt: user.deletedAt,
    emailVerified: !!user.emailVerifiedAt,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
    createdAt: user.createdAt,
  });
  if (user.status === 'DELETED') {
    console.error(
      'This account was deleted (soft delete). Use the in-app "Recover account" first, or tell me and I will add a restore option. Nothing changed.',
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log(
    `Password reset for ${user.email}. Failed-login count and any lockout were cleared too.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
