# WordQuest backend — production image.
#
# Multi-stage: `deps` installs once and is reused by both `build` (needs
# devDependencies to compile) and the final runtime stage (needs only
# production dependencies), so the shipped image never carries the
# TypeScript toolchain, ts-jest, eslint, etc.
#
# Database migrations are NOT run by this image on boot — see
# docs/DEPLOYMENT.md. `prisma migrate deploy` is a separate, explicit
# step in the deploy pipeline (see .github/workflows/deploy.yml), run
# once per release before the new containers take traffic, never as a
# container-startup side effect (concurrent replicas racing to migrate
# on boot is exactly the kind of failure mode a deploy pipeline should
# prevent, not reproduce).
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
