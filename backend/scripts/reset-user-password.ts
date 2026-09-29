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
//   DATABASE_URL="<railway public connection string>" \
//     npx ts-node scripts/reset-user-password.ts --email you@example.com --password "NewPassword123!"
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const PASSWORD_SALT_ROUNDS = 12; // must match users.service.ts

const prisma = new PrismaClient();

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main() {
  const email = readArg('--email');
  const password = readArg('--password');

  if (!email || !password) {
    console.error(
      'Usage: ts-node scripts/reset-user-password.ts --email <email> --password <newPassword>',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error(
      'Password must be at least 8 characters (matches RegisterDto/ResetPasswordDto validation).',
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      createdAt: true,
    },
  });

  if (!user) {
    console.error(`No account found for ${email}. Nothing changed.`);
    process.exit(1);
  }

  console.log('Found account:', {
    id: user.id,
    email: user.email,
    status: user.status,
    emailVerified: !!user.emailVerifiedAt,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
    createdAt: user.createdAt,
  });

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
