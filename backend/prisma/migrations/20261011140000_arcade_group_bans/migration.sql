-- CreateTable
CREATE TABLE "arcade_group_bans" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arcade_group_bans_pkey" PRIMARY KEY ("groupId","userId")
);

-- AddForeignKey
ALTER TABLE "arcade_group_bans" ADD CONSTRAINT "arcade_group_bans_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "arcade_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_group_bans" ADD CONSTRAINT "arcade_group_bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
