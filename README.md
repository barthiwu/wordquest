# WordQuest

Gamified language/vocabulary learning platform. Vocabulary + mastery + XP + Journey + Clans + Kingdom + Boss Battles + ALI, built on a working learning loop.

Status: **foundation stage** — see `docs/BUILD_HANDOFF.md` for full product/technical context and build order.

## Structure

```
WordQuest/
├── backend/    # NestJS API (modular monolith)
├── mobile/     # Expo + React Native + TypeScript app
├── docs/       # Product/technical handoff reference
└── docker-compose.yml   # local Postgres + Redis
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (for local Postgres + Redis)

## Quick start

```bash
# 1. Start local infra
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev     # applies the committed migration history
npm run start:dev
# → http://localhost:3000/api/v1/health

# 3. Mobile (separate terminal)
cd mobile
cp .env.example .env
npm install
npx expo start
```

## Architecture (locked decisions)

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo + TypeScript |
| Backend | NestJS + TypeScript, modular monolith |
| Database | PostgreSQL (source of truth) via Prisma |
| Cache / real-time state | Redis |
| Real-time | WebSockets (Boss Battles) |
| Object storage | S3-compatible |
| AI | Backend-mediated only — mobile never calls an AI provider directly |

Non-negotiables (see `docs/BUILD_HANDOFF.md` §41): backend is authoritative for XP, Glyphs, Mastery, CEFR, and Battle scoring. The client never computes these values itself.

## Build order

Foundation → Identity → Learning → Progression → Game → World → Platform → Commercial.
Current phase: **Foundation** (repo, CI, env config, DB schema, backend/mobile shells).

First playable milestone (target): register → onboarding → home → start Daily Quest → see word → answer → feedback → XP → quest complete → see progress.
