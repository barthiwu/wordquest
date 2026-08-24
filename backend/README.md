# WordQuest Backend

NestJS modular monolith. See `../docs/BUILD_HANDOFF.md` for the full technical
architecture and non-negotiables.

## Local development

```bash
cp .env.example .env       # fill in JWT secrets locally
docker compose -f ../docker-compose.yml up -d   # Postgres + Redis
npm install
npx prisma generate
npx prisma migrate dev     # applies the committed migration history (prisma/migrations/)
npx prisma db seed         # seeds clans + the 2000-word vocabulary vault
npm run start:dev
```

`GET http://localhost:3000/api/v1/health` should return `{ "status": "ok", ... }`.

### Schema changes and migrations

`prisma/migrations/` is real, incremental migration history — checked into
the repo, not regenerated from scratch. To change the schema:

```bash
# 1. Edit prisma/schema.prisma
# 2. Generate + apply a new migration from the diff, named for what it does
npx prisma migrate dev --name add_thing_to_model
```

For staging/production, migrations are applied non-interactively — this
never prompts and never generates a new migration file, so it's the only
command a deploy pipeline should run against the schema:

```bash
npx prisma migrate deploy   # == npm run prisma:deploy
```

`npx prisma migrate reset` (drops + recreates the DB, replays every
migration, then reseeds) is a local-development-only escape hatch — never
run it against staging or production data.

## Layout

```
src/
├── main.ts              # bootstrap, versioning, global validation pipe
├── app.module.ts
├── config/               # centralized, typed env config (§12/§46)
├── prisma/                # PrismaService — Postgres is the source of truth (§9/§41)
└── health/                # GET /api/v1/health
```

Feature modules (Auth, Users, Quests, Mastery, Battles, ...) are added one at
a time following the build order in `../docs/BUILD_HANDOFF.md` §47.
