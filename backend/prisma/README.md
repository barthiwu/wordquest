# Prisma — WordQuest

`schema.prisma` covers the full V1 domain — identity, clans, XP/Glyph
ledgers, progression, Quest/Word/Attempt/Battle/Journey/CEFR, and
everything added across Sprints 1-5. `prisma/migrations/` is real,
incremental migration history checked into the repo — every schema change
is its own timestamped migration, not a single regenerated snapshot.

```bash
# generate the client
npx prisma generate

# local dev: apply the committed migration history (and, if
# schema.prisma has uncommitted changes, generate + apply a new
# migration for them, prompting for a name)
npx prisma migrate dev

# non-interactive: apply pending migrations only, no prompts, no new
# migration files — the only command CI/staging/production should run
npx prisma migrate deploy

# seed clans + the 10,000-word vocabulary vault
npx ts-node prisma/seed.ts
```

Changing the schema: edit `schema.prisma`, then run
`npx prisma migrate dev --name <what_changed>` to generate the migration
file for that diff. Never hand-edit a migration that's already been
applied anywhere outside your own machine — add a new one instead.
