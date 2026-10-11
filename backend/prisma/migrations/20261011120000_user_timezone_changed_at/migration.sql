-- Rate-limits timezone changes (see User.timezoneChangedAt in schema.prisma).
ALTER TABLE "User" ADD COLUMN "timezoneChangedAt" TIMESTAMP(3);
