-- V22 §10 (Glyph Economy Security Audit) finding: glyphBalance was only
-- ever protected against going negative by application-level code
-- (ProgressionService.spendGlyphs's atomic `WHERE glyphBalance >= amount`
-- compare-and-decrement). That is sound for every current write path,
-- but there was no database-level backstop if that discipline is ever
-- broken by a future direct write (a migration script, an admin tool,
-- a new call site that forgets to go through spendGlyphs). This adds
-- that backstop as defense-in-depth, additive and non-destructive: it
-- only ever rejects a write that would already have been a bug.
ALTER TABLE "user_progression"
  ADD CONSTRAINT "user_progression_glyphBalance_nonnegative"
  CHECK ("glyphBalance" >= 0);
