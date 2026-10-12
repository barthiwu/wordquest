# Arcade: when a word's clock starts

Applies to ScrambleQuest, Complete It and Hangman (solo, head-to-head and Group Play).
Word Duel is a different model (one match clock) and is unchanged.

## The rule

A word's timer starts when the player is **on that word**, not when the previous
one was answered. Time spent reading the last result, the meaning card or the
Ali reaction is never charged to the next word.

## Why it was wrong

On every answer the server reset `currentWordStartedAt` and sent the next word in
the same response. The app only showed that word after the player tapped
Continue, so the clock ran through the result screen.

## How it works now

1. The app answers with `deferNext: true` (ScrambleQuest/Complete It: `/answer`,
   Hangman: `/guess` and `/timeout`).
2. The server records the answer, advances `currentIndex`, sets
   `currentWordPending = true` and sends **no** next word (`nextChallenge: null`,
   `sessionComplete: false`). The word is not revealed, so there is nothing to
   read early.
3. The player taps Continue. The app calls `POST .../:sessionId/begin`.
4. `begin` sets `currentWordStartedAt = now` and `currentWordPending = false` in a
   single compare-and-swap, and returns the word with its `deadlineAt`. It is
   idempotent: a retry or double tap returns the same word and the same deadline.
5. Relaunching the app on a held-back word resumes it through the same call
   (start/resume begins it) so a closed app never loses the word to a stale clock.

While a word is pending the server refuses answers, hints and timeouts for it
(409 "Start the next word first.") because its clock has not started.

Code: `backend/src/arcade/word-clock.ts` (`beginPendingWord`), the three
services' `beginWord`, `currentWordPending` on `ArcadeGameSession`
(migration `20261012120000_arcade_word_pending`).

## Older app builds

Builds without this change never send `deferNext`. For them nothing changes: the
server still sends the next word straight away and resets the clock at answer
time, so they keep the old (unfair) timing but keep working. They cannot be
patched over the air if they predate expo-updates.

A new app build talking to a server **without** this change would get a 400
(unknown field `deferNext`). Deploy the backend first, then ship the app.

## Hints in the letter boxes (same release)

Typed letters are stored compactly over the unlocked boxes. A hint locks one more
box, so the compact text must be laid out again. It used to be re-flowed, sliding
every later letter along (`Excet` + hint `I` gave `Exciet`). Now the hint letter
**replaces** whatever was typed in its box and the other letters stay put
(`Excet` + `I` gives `Excit`). See `mobile/src/components/letterBoxAnswer.ts`.

## Hangman length

`HANGMAN_CONFIG.WORDS_PER_SESSION` is 10 (was 5). Group and head-to-head rounds
follow it. Sessions already in progress keep the length they started with.
