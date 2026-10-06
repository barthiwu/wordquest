-- Hangman arcade game: a new ArcadeGame value plus the per-word guess state
-- the single-player session needs. Additive only.
ALTER TYPE "ArcadeGame" ADD VALUE 'HANGMAN';

ALTER TABLE "arcade_game_sessions"
  ADD COLUMN "currentWordGuesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "currentWordGuessCount" INTEGER NOT NULL DEFAULT 0;
