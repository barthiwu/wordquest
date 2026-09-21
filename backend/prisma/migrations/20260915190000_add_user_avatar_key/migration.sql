-- Profile pictures: stores the S3-compatible object storage key for the
-- player's avatar, mirroring WordInTheWild's evidence photoKey pattern
-- (a key, never a URL directly -- a signed download URL is minted on
-- read and expires, while the key itself is stable). Additive and
-- nullable: existing accounts simply have no avatar until they set one.
ALTER TABLE "users" ADD COLUMN "avatarKey" TEXT;
