# WordQuest backend — production image.
#
# Multi-stage: `deps` installs once and is reused by both `build` (needs
# devDependencies to compile) and the final runtime stage (needs only
# production dependencies), so the shipped image never carries the
# TypeScript toolchain, ts-jest, eslint, etc.
#
# Database migrations are NOT run by this image's CMD on boot. They run
# as Railway's PRE-DEPLOY COMMAND (backend/railway.json:
# `npx prisma migrate deploy`), which Railway executes once per deploy,
# in this same image, against the service's DATABASE_URL, BEFORE the new
# container takes traffic. If a migration fails the deploy is aborted and
# the old version keeps serving. That is why the Prisma CLI is a runtime
# dependency (package.json `dependencies`), not a devDependency. Never
# bake migrate into CMD: concurrent replicas racing to migrate on boot is
# the failure mode a pre-deploy step exists to prevent.
#
# Validation note: the sandbox this was authored in has no network
# route to registry-1.docker.io (blocked by the environment's egress
# allowlist), so `docker build` itself could not be exercised here.
# What WAS verified directly: `npm run build` (the same `nest build`
# this image runs) produces `dist/src/main.js`, and running that build
# output with `node dist/src/main` boots the app and serves a healthy
# GET /api/v1/health. CI (.github/workflows/deploy.yml) builds this
# image on GitHub's runners, which do have registry access, so that
# first build there is the actual `docker build` validation — worth
# watching closely on its first real run.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
# Alpine ships no OpenSSL runtime by default; Prisma's query engine
# needs it present at generate-time to detect and fetch the correct
# musl/OpenSSL engine binary variant (libssl.so.1.1 "No such file or
# directory" otherwise).
RUN apk add --no-cache openssl
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json* nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S wordquest && adduser -S wordquest -G wordquest

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Same OpenSSL requirement as the build stage above — this is the
# image that actually runs, so the engine binary loaded here is the
# one that matters at boot.
RUN apk add --no-cache openssl
COPY prisma ./prisma
# Prisma's generated client is version/schema-specific — regenerate
# against the production install rather than copying node_modules
# wholesale from the build stage.
RUN npx prisma generate

COPY --from=build /app/dist ./dist

USER wordquest
EXPOSE 3000

# No HEALTHCHECK instruction here on purpose — the orchestrator (ECS/K8s/
# Fly/etc.) should poll GET /api/v1/health itself using its own health-
# check mechanism, which already has richer semantics (readiness vs.
# liveness) than a single Dockerfile HEALTHCHECK can express.

# nest build's outDir is ./dist with sourceRoot "src" preserved, so the
# real entrypoint is dist/src/main.js, not dist/main.js — verified by
# running the local build and starting it directly (see
# docs/DEPLOYMENT.md for how this was caught).
CMD ["node", "dist/src/main"]
