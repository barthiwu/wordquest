-- Age gate (COPPA): date of birth, collected once at registration.
-- Additive and nullable, same pattern as avatarKey (migration
-- 20260915190000_add_user_avatar_key) -- existing accounts simply have
-- no recorded date of birth. New accounts have this rejected at the
-- application layer (AuthService.register) before the row is ever
-- created when the submitted birthdate is under gameplayRules.auth.minimumAgeYears.
ALTER TABLE "users" ADD COLUMN "dateOfBirth" DATE;
