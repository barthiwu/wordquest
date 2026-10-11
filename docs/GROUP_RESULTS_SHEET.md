# Group Play: host result sheet and downloads

The host of a Group Play round can see everything each player did, and
download it. Members never see other people's typed answers.

## What the host sees

For every member of the group:

- rank, correct count, answered count, and the **total time the player used**
  (the sum of the server-measured time on each word),
- for **every word**, exactly what they typed, with the correct word beside it:
  **green** when it was right, **red** when it was wrong (a timed-out word is
  red too). Example: Complete It word `reject`, player types `recjet` -> red.
  Each cell also carries a mark (check / cross) and a spoken label, so the
  result does not depend on colour alone.
- a word the player never reached is shown as "-", never guessed.

Hangman has no typed word, so its cell shows the **letters guessed, in order**;
green means the word was solved, red means it was not.

The sheet is available as soon as the round has been opened and is marked
"still running" until the round ends. Members the host removed are not on it.

## Endpoints (host only, 403 for anyone else, 404 for non-members)

| Route | Returns |
|---|---|
| `GET /arcade/groups/:id/results` | JSON sheet (drives the on-screen view) |
| `GET /arcade/groups/:id/results.csv` | CSV download |
| `GET /arcade/groups/:id/results.pdf` | PDF download |

409 until the round has been opened. All responses are `Cache-Control: no-store`.
The CSV and PDF are limited to 10 a minute, the JSON to 30.

## CSV

UTF-8 with a byte-order mark (so Excel reads any script), CRLF line endings.
Two tables in one file: a summary (one row per player: rank, status, correct,
answered, words, total time as `m:ss` and in seconds) then an answers table
(one row per player and word: correct word, what was typed, Correct / Wrong /
Timed out / Not answered, seconds). Text cells beginning with `= + - @` or a
tab get a leading apostrophe so a hostile name or typed answer cannot run as a
spreadsheet formula.

## PDF

A4, a summary table then one block per player with a row per word, typed text
in green or red, and page numbers. The built-in PDF fonts cover Latin text
only, so characters outside Latin-1 (for example a name written in Arabic or
Chinese) print as `?` in the PDF. The CSV and the on-screen sheet keep every
character. Embedding a Unicode font would lift this.

## Where it lives

- Backend: `backend/src/arcade/group/group-results.util.ts` (sheet, CSV),
  `group-results.pdf.ts` (PDF, uses `pdfkit`), `getResultSheet` in
  `group.service.ts`, routes in `group.controller.ts`.
- App: `mobile/src/features/arcade/group/GroupResultSheet.tsx` (card on the
  group screen, host only), `groupResultsDownload.ts`, `groupResultsFormat.ts`;
  files are saved by `mobile/src/services/fileExport.ts` (share sheet on a
  phone) and `fileExport.web.ts` (browser download).
- `apiRequestFile` in `apiClient.ts` fetches the files with the same sign-in
  and token-refresh handling as every other call.

## Privacy note

Typed answers are shown to the host only. Members join knowing the host sees
scores; consider saying on the join screen that the host can also see what
each player typed.
