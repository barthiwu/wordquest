-- Rate-limits timezone changes (see User.timezoneChangedAt in schema.prisma).
ALTER TABLE "users" ADD COLUMN "timezoneChangedAt" TIMESTAMP(3);
